import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { asOf } from "@/lib/format";
import { load } from "@/lib/server";
import type { Headline } from "@/lib/types";
import "./globals.css";

// Self-hosted from @fontsource (OFL), so builds need no network access to a font CDN.
const sans = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Midterm/26 Atlas",
  description: "The 2026 U.S. midterm elections in charts: House, Senate, governors, counties, turnout, ballot measures, local races and exit polls.",
};

const NAV = [
  { href: "/", label: "Story" },
  { href: "/explore/races/", label: "Races" },
  { href: "/explore/map/", label: "Map" },
  { href: "/explore/measures/", label: "Measures" },
  { href: "/explore/local/", label: "Local" },
  { href: "/explore/exit/", label: "Exit polls" },
  { href: "/states/", label: "States" },
  { href: "/ask/", label: "Ask ▸" },
  { href: "/methods/", label: "Methods" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const stamp = load<Headline[]>("headline")[0]?.as_of;
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
            <Link href="/" className="num text-sm font-medium tracking-wider text-fg">
              MIDTERM<span className="text-accent">/26</span> ATLAS
            </Link>
            <nav className="num flex flex-wrap gap-x-4 gap-y-1 text-xs uppercase tracking-wider text-muted" aria-label="Sections">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-accent">
                  {n.label}
                </Link>
              ))}
            </nav>
            {stamp && (
              <span className="num ml-auto text-[11px] text-dim">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber align-middle" aria-hidden />
                UNOFFICIAL · {asOf(stamp)}
              </span>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl border-t border-line px-4 py-6 text-xs leading-relaxed text-dim">
          Results: civicAPI (unofficial). 2024 baseline: county presidential results, tonmcg (MIT). Eligible voters: UF Election Lab.
          County traits: USDA ERS. Exit polls: NBC News. Measure titles: Wikipedia (CC BY-SA). Maps: us-atlas.{" "}
          <Link href="/methods/" className="text-muted underline underline-offset-2 hover:text-accent">
            Methods and caveats
          </Link>
        </footer>
      </body>
    </html>
  );
}
