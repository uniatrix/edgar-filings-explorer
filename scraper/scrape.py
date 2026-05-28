"""
SEC EDGAR Filings Explorer — data collector.

Pulls recent company filings from the SEC EDGAR full-text/submissions API,
normalizes them into a clean, deduplicated dataset, and writes JSON + CSV
that the dashboard consumes.

Design notes
------------
- SEC asks every automated client to send a descriptive User-Agent and to
  stay under ~10 requests/second (https://www.sec.gov/os/webmaster-faq#developers).
  We declare a User-Agent and throttle every request, well under the limit.
- We prefer EDGAR's official JSON endpoints over scraping HTML where they
  exist (the correct, resilient approach), and fall back to parsing the
  filing index when we need a document we can't get from JSON.
- Everything is configurable via watchlist.json — no code changes needed
  to track different companies or form types.
"""

from __future__ import annotations

import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"
WATCHLIST = Path(__file__).resolve().parent / "watchlist.json"

# SEC requires a descriptive User-Agent identifying the requester.
# Override via the SEC_USER_AGENT env var in CI.
import os

USER_AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "EDGAR Filings Explorer (portfolio demo) contact@example.com",
)
HEADERS = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
ARCHIVE_BASE = "https://www.sec.gov/Archives/edgar/data/"

# Be polite: SEC allows ~10 req/s; we use a comfortable margin.
REQUEST_DELAY_SECONDS = 0.20


class Throttle:
    """Minimal request pacer so we never exceed SEC's fair-access limits."""

    def __init__(self, delay: float):
        self.delay = delay
        self._last = 0.0

    def wait(self) -> None:
        elapsed = time.monotonic() - self._last
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last = time.monotonic()


throttle = Throttle(REQUEST_DELAY_SECONDS)


def get_json(url: str, *, attempts: int = 3) -> dict | None:
    """GET a URL as JSON with throttling and simple retry/backoff."""
    for attempt in range(1, attempts + 1):
        throttle.wait()
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 404:
                return None
            print(f"  ! {resp.status_code} for {url} (attempt {attempt})", file=sys.stderr)
        except requests.RequestException as exc:
            print(f"  ! request error for {url}: {exc} (attempt {attempt})", file=sys.stderr)
        time.sleep(2 * attempt)  # linear backoff
    return None


def load_watchlist() -> dict:
    with WATCHLIST.open(encoding="utf-8") as fh:
        return json.load(fh)


def build_ticker_index() -> dict[str, dict]:
    """Map upper-case ticker -> {cik, title} using EDGAR's master list."""
    raw = get_json(TICKERS_URL)
    if not raw:
        raise RuntimeError("Could not fetch SEC company_tickers.json")
    index: dict[str, dict] = {}
    for row in raw.values():
        index[row["ticker"].upper()] = {
            "cik": int(row["cik_str"]),
            "title": row["title"],
        }
    return index


def accession_to_path(accession: str) -> str:
    """'0000320193-24-000123' -> '000032019324000123' (folder name)."""
    return accession.replace("-", "")


def collect_company(ticker: str, info: dict, forms: set[str], limit: int) -> list[dict]:
    cik = info["cik"]
    data = get_json(SUBMISSIONS_URL.format(cik=cik))
    if not data:
        print(f"  - {ticker}: no submissions data", file=sys.stderr)
        return []

    recent = data.get("filings", {}).get("recent", {})
    if not recent:
        return []

    rows: list[dict] = []
    accession_numbers = recent.get("accessionNumber", [])
    for i in range(len(accession_numbers)):
        form = recent["form"][i]
        if forms and form not in forms:
            continue

        accession = accession_numbers[i]
        primary_doc = recent["primaryDocument"][i]
        folder = accession_to_path(accession)
        doc_url = f"{ARCHIVE_BASE}{cik}/{folder}/{primary_doc}" if primary_doc else ""
        index_url = f"{ARCHIVE_BASE}{cik}/{folder}/{accession}-index.htm"

        rows.append(
            {
                "ticker": ticker,
                "company": info["title"],
                "cik": cik,
                "form": form,
                "filing_date": recent["filingDate"][i],
                "report_date": recent.get("reportDate", [""] * len(accession_numbers))[i],
                "accession": accession,
                "primary_doc_description": recent.get(
                    "primaryDocDescription", [""] * len(accession_numbers)
                )[i],
                "document_url": doc_url,
                "filing_index_url": index_url,
            }
        )
        if len(rows) >= limit:
            break
    print(f"  + {ticker} ({info['title']}): {len(rows)} filings")
    return rows


def dedupe(rows: list[dict]) -> list[dict]:
    """Drop duplicate filings (same company + accession number)."""
    seen: set[tuple] = set()
    unique: list[dict] = []
    for row in rows:
        key = (row["cik"], row["accession"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def write_outputs(rows: list[dict], meta: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    payload = {"meta": meta, "filings": rows}
    (DATA_DIR / "filings.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    fieldnames = [
        "ticker",
        "company",
        "cik",
        "form",
        "filing_date",
        "report_date",
        "accession",
        "primary_doc_description",
        "document_url",
        "filing_index_url",
    ]
    with (DATA_DIR / "filings.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    config = load_watchlist()
    tickers = [t.upper() for t in config["tickers"]]
    forms = set(config.get("forms", []))
    limit = int(config.get("max_filings_per_company", 25))

    print(f"Resolving {len(tickers)} tickers against SEC EDGAR...")
    index = build_ticker_index()

    all_rows: list[dict] = []
    resolved = 0
    for ticker in tickers:
        info = index.get(ticker)
        if not info:
            print(f"  - {ticker}: not found in EDGAR ticker list", file=sys.stderr)
            continue
        resolved += 1
        all_rows.extend(collect_company(ticker, info, forms, limit))

    all_rows = dedupe(all_rows)
    # Newest filings first.
    all_rows.sort(key=lambda r: r["filing_date"], reverse=True)

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "SEC EDGAR (https://www.sec.gov/edgar)",
        "companies_tracked": resolved,
        "total_filings": len(all_rows),
        "forms": sorted(forms),
    }
    write_outputs(all_rows, meta)
    print(
        f"\nDone: {len(all_rows)} filings from {resolved} companies "
        f"-> {DATA_DIR/'filings.json'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
