import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEC EDGAR Filings Explorer",
  description:
    "A scheduled scraper and dashboard for recent SEC EDGAR company filings — search, filter, and export structured filing data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
