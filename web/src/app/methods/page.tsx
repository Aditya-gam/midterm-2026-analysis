import type { Metadata } from "next";
import { Panel, PageHeader } from "@/components/ui";
import { asOf } from "@/lib/format";
import { load } from "@/lib/server";
import type { Headline } from "@/lib/types";

export const metadata: Metadata = { title: "Methods · Midterm/26 Atlas" };

const SOURCES = [
  ["2026 results, every level", "civicAPI (civicapi.org), unofficial counts", "https://civicapi.org"],
  ["2024 and 2020 county presidential results", "tonmcg/US_County_Level_Election_Results_08-24 (MIT)", "https://github.com/tonmcg/US_County_Level_Election_Results_08-24"],
  ["Eligible voters, 2022 turnout", "UF Election Lab", "https://election.lab.ufl.edu/voter-turnout/"],
  ["County education, income, rural-urban codes", "USDA Economic Research Service", "https://www.ers.usda.gov/data-products/county-level-data-sets/"],
  ["Town-to-county lookup", "U.S. Census Bureau, 2020 county subdivisions", "https://www.census.gov/library/reference/code-lists/ansi.html"],
  ["County and state outlines", "us-atlas 3.0.1 (Albers USA)", "https://github.com/topojson/us-atlas"],
  ["Exit polls 2022, 2024, 2026", "NBC News national exit polls", "https://www.nbcnews.com/politics/2026-elections/exit-polls"],
  ["Ballot measure titles", "Wikipedia, 2026 United States ballot measures (CC BY-SA)", "https://en.wikipedia.org/wiki/2026_United_States_ballot_measures"],
] as const;

const FILES = [
  "races_federal",
  "headline",
  "statewide_vs_pres",
  "county_swing",
  "swing_by_type",
  "turnout_state",
  "measures_statewide",
  "measures_local",
  "office_by_state",
  "state_legislatures",
  "exit_shift",
];

export default function Page() {
  const stamp = load<Headline[]>("headline")[0]?.as_of;
  return (
    <div className="grid gap-5">
      <PageHeader kicker="Methods" title="How the numbers were made, and where they are weak">
        Counts were downloaded {stamp ? asOf(stamp) : "on election night"} and are unofficial. Everything here is rebuilt by a Python pipeline
        (in the project repository) that fetches, cleans and summarizes the sources below.
      </PageHeader>

      <Panel label="Definitions">
        <dl className="grid gap-3 text-sm leading-relaxed text-muted sm:grid-cols-2">
          <div>
            <dt className="num text-xs uppercase tracking-wider text-fg">Margin</dt>
            <dd>Democratic share minus Republican share of all votes cast in the race, in percentage points. D+10 means Democrats lead by 10.</dd>
          </div>
          <div>
            <dt className="num text-xs uppercase tracking-wider text-fg">Shift</dt>
            <dd>
              A county&apos;s 2026 margin in its state&apos;s top statewide race (Senate if both parties ran, else governor) minus its 2024
              presidential margin. Counties, not districts, because several states redrew congressional maps after 2024.
            </dd>
          </div>
          <div>
            <dt className="num text-xs uppercase tracking-wider text-fg">Turnout</dt>
            <dd>
              Votes in the state&apos;s largest one-vote race (Senate, governor, a statewide measure, or all House races together) divided by
              eligible citizens. Slightly below total ballots cast; rises as counting finishes.
            </dd>
          </div>
          <div>
            <dt className="num text-xs uppercase tracking-wider text-fg">Uncontested</dt>
            <dd>No more candidates ran than there were seats, ignoring write-in lines.</dd>
          </div>
          <div>
            <dt className="num text-xs uppercase tracking-wider text-fg">Won or leading</dt>
            <dd>Called by the source where it marks a winner; otherwise the candidate currently ahead. Local winners are rarely marked.</dd>
          </div>
          <div>
            <dt className="num text-xs uppercase tracking-wider text-fg">Measure topics</dt>
            <dd>Keyword rules on each measure&apos;s title, then its Wikipedia description. Measures known only by number stay undescribed.</dd>
          </div>
        </dl>
      </Panel>

      <Panel label="Known problems in the data">
        <ul className="grid list-disc gap-2 pl-5 text-sm leading-relaxed text-muted">
          <li>New York&apos;s raw vote counts in the source are about three times too high. Its margins are used; its votes are left out of totals and turnout.</li>
          <li>Mail-voting states (California, Washington, Oregon, Utah) report &ldquo;100% of precincts&rdquo; while ballots are still being counted.</li>
          <li>Alaska reports 2024 by legislative district, so it has no county comparison; its races show 0% reporting while carrying votes.</li>
          <li>No state legislative counts yet for Indiana, North Carolina, South Carolina, Texas or the Kentucky Senate. Louisiana, Virginia and Mississippi elect legislatures in odd years.</li>
          <li>The source&apos;s incumbent flags are incomplete, so incumbency is not charted.</li>
          <li>Exit polls change methods between years, and 2024 measured the presidential vote, not the House vote.</li>
        </ul>
      </Panel>

      <Panel label="Sources">
        <ul className="grid gap-2 text-sm">
          {SOURCES.map(([what, who, href]) => (
            <li key={what} className="grid gap-0.5 border-b border-line pb-2 sm:grid-cols-[16rem_1fr]">
              <span className="text-muted">{what}</span>
              <a href={href} className="text-fg underline decoration-line2 underline-offset-2 hover:text-accent" target="_blank" rel="noreferrer">
                {who}
              </a>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel label="Download the data" meta="JSON, as used by this site">
        <div className="num flex flex-wrap gap-2 text-xs">
          {FILES.map((f) => (
            <a key={f} href={`/data/${f}.json`} className="border border-line2 px-2 py-1 text-muted hover:border-accent hover:text-accent" download>
              {f}.json
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );
}
