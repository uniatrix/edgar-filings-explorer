"use client";

import { useMemo, useState } from "react";

export type Filing = {
  ticker: string;
  company: string;
  cik: number;
  form: string;
  filing_date: string;
  report_date: string;
  accession: string;
  primary_doc_description: string;
  document_url: string;
  filing_index_url: string;
};

export type Meta = {
  generated_at: string;
  source: string;
  companies_tracked: number;
  total_filings: number;
  forms: string[];
};

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

function toCsv(rows: Filing[]): string {
  const headers = [
    "ticker",
    "company",
    "cik",
    "form",
    "filing_date",
    "report_date",
    "accession",
    "primary_doc_description",
    "document_url",
  ];
  const escape = (value: string | number) => {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      headers.map((h) => escape((r as unknown as Record<string, string | number>)[h])).join(","),
    );
  }
  return lines.join("\n");
}

export default function FilingsExplorer({
  meta,
  filings,
}: {
  meta: Meta;
  filings: Filing[];
}) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState("ALL");
  const [ticker, setTicker] = useState("ALL");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  const tickers = useMemo(
    () => Array.from(new Set(filings.map((f) => f.ticker))).sort(),
    [filings],
  );
  const forms = useMemo(
    () => Array.from(new Set(filings.map((f) => f.form))).sort(),
    [filings],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = filings.filter((f) => {
      if (form !== "ALL" && f.form !== form) return false;
      if (ticker !== "ALL" && f.ticker !== ticker) return false;
      if (q && !(`${f.company} ${f.ticker} ${f.form}`.toLowerCase().includes(q)))
        return false;
      return true;
    });
    rows.sort((a, b) =>
      sortDesc
        ? b.filing_date.localeCompare(a.filing_date)
        : a.filing_date.localeCompare(b.filing_date),
    );
    return rows;
  }, [filings, query, form, ticker, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function downloadCsv() {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edgar-filings.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetPageAnd(fn: () => void) {
    fn();
    setPage(1);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          SEC EDGAR Filings Explorer
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
          A scheduled Python scraper pulls recent company filings from the U.S.
          SEC EDGAR system, normalizes them into a clean dataset, and refreshes
          this dashboard automatically. Search, filter by form type or company,
          and export the results as CSV.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Filings" value={meta.total_filings.toLocaleString()} />
        <Stat label="Companies" value={String(meta.companies_tracked)} />
        <Stat label="Form types" value={String(meta.forms.length)} />
        <Stat
          label="Last updated"
          value={
            meta.generated_at
              ? new Date(meta.generated_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"
          }
        />
      </section>

      <section className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search company, ticker, or form…"
          value={query}
          onChange={(e) => resetPageAnd(() => setQuery(e.target.value))}
          className="min-w-56 flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-600"
        />
        <select
          value={ticker}
          onChange={(e) => resetPageAnd(() => setTicker(e.target.value))}
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        >
          <option value="ALL">All companies</option>
          {tickers.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={form}
          onChange={(e) => resetPageAnd(() => setForm(e.target.value))}
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        >
          <option value="ALL">All forms</option>
          {forms.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          onClick={downloadCsv}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          Export CSV ({filtered.length})
        </button>
      </section>

      <div className="overflow-hidden rounded-xl border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Ticker</th>
              <th className="px-4 py-3">Form</th>
              <th
                className="cursor-pointer select-none px-4 py-3"
                onClick={() => setSortDesc((v) => !v)}
              >
                Filed {sortDesc ? "▼" : "▲"}
              </th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Filing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-900">
            {pageRows.map((f) => (
              <tr key={`${f.cik}-${f.accession}`} className="hover:bg-neutral-900/50">
                <td className="px-4 py-3 text-neutral-200">{f.company}</td>
                <td className="px-4 py-3 font-mono text-neutral-400">{f.ticker}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300">
                    {f.form}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-300">{formatDate(f.filing_date)}</td>
                <td className="px-4 py-3 text-neutral-500">{formatDate(f.report_date)}</td>
                <td className="px-4 py-3">
                  <a
                    href={f.filing_index_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 hover:underline"
                  >
                    View ↗
                  </a>
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                  No filings match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-neutral-400">
        <span>
          Showing {pageRows.length} of {filtered.length} filings
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded border border-neutral-800 px-3 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {safePage} / {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
            className="rounded border border-neutral-800 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <footer className="mt-10 border-t border-neutral-900 pt-6 text-xs text-neutral-600">
        Data sourced from{" "}
        <a
          href="https://www.sec.gov/edgar/searchedgar/companysearch"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-400 hover:underline"
        >
          SEC EDGAR
        </a>{" "}
        via a scheduled scraper that respects SEC fair-access guidelines
        (declared User-Agent, throttled requests). Refreshes daily via GitHub
        Actions. Built by Cesar Seabra.
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
