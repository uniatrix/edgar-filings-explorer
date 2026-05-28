# SEC EDGAR Filings Explorer

A small end-to-end data pipeline: a scheduled **Python scraper** pulls recent
company filings from the U.S. **SEC EDGAR** system, normalizes them into a
clean, deduplicated dataset, and a **Next.js dashboard** lets you search,
filter, and export them as CSV. The data refreshes automatically every day via
GitHub Actions.

**Live demo:** _add your Vercel URL here_

![Dashboard screenshot](docs/screenshot.png)

## What it demonstrates

- **Web data extraction** from a real public source, using EDGAR's official
  JSON endpoints where they exist (the resilient approach) instead of brittle
  HTML scraping.
- **Respectful scraping** — a declared `User-Agent` and throttled requests that
  stay well under [SEC's fair-access limits](https://www.sec.gov/os/webmaster-faq#developers).
- **Data normalization** — deduplication, consistent schema, and both JSON and
  CSV outputs.
- **Automation** — a daily GitHub Actions cron re-runs the scraper and commits
  fresh data, which triggers a redeploy.
- **A clean dashboard UI** — search, per-company and per-form filtering,
  sortable columns, pagination, and one-click CSV export.

## Architecture

```
┌──────────────────────┐     daily cron      ┌──────────────────────┐
│  GitHub Actions       │ ──────────────────▶ │  scraper/scrape.py    │
│  (.github/workflows)  │                     │  (Python + requests)  │
└──────────────────────┘                     └───────────┬──────────┘
                                                          │ writes
                                                          ▼
                                          public/data/filings.{json,csv}
                                                          │ read at build
                                                          ▼
                                    ┌──────────────────────────────────┐
                                    │  Next.js dashboard (Vercel)        │
                                    │  search · filter · sort · export   │
                                    └──────────────────────────────────┘
```

## Run it locally

```bash
# 1. Collect data (writes public/data/filings.{json,csv})
pip install -r scraper/requirements.txt
SEC_USER_AGENT="Your Name your@email.com" python scraper/scrape.py

# 2. Run the dashboard
npm install
npm run dev   # http://localhost:3000
```

## Configure what it tracks

Edit [`scraper/watchlist.json`](scraper/watchlist.json) to change the tracked
tickers, the form types to include (`10-K`, `10-Q`, `8-K`, …), and how many
filings to keep per company. No code changes required.

## Tech

Python · requests · Next.js (App Router) · React · TypeScript · Tailwind CSS ·
GitHub Actions · Vercel

---

Built by **Cesar Seabra** — [github.com/uniatrix](https://github.com/uniatrix)
