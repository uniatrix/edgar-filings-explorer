import fs from "node:fs";
import path from "node:path";
import FilingsExplorer, { type Filing, type Meta } from "./filings-explorer";

export const dynamic = "force-static";

function loadData(): { meta: Meta; filings: Filing[] } {
  const file = path.join(process.cwd(), "public", "data", "filings.json");
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      meta: {
        generated_at: "",
        source: "SEC EDGAR (https://www.sec.gov/edgar)",
        companies_tracked: 0,
        total_filings: 0,
        forms: [],
      },
      filings: [],
    };
  }
}

export default function Page() {
  const { meta, filings } = loadData();
  return <FilingsExplorer meta={meta} filings={filings} />;
}
