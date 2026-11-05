"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { BarList, Dumbbell, ExitShiftChart, RaceSwarm, Scatter, SwingTypes, measureTip } from "@/components/charts/charts";
import { CountyMap, Legend, TileMap } from "@/components/charts/map";
import { Stat } from "@/components/ui";
import { useJson } from "@/lib/client";
import {
  binColor,
  compact,
  DIVERGING,
  int,
  margin,
  partyColor,
  pct,
  SHIFT_BREAKS,
  signed,
  tickMargin,
  toward,
} from "@/lib/format";
import type {
  CountySwing,
  ExitShift,
  FederalRace,
  GeoShape,
  Headline,
  Measure,
  MeasureFeatured,
  OfficeContest,
  StatewideVsPres,
  SwingByType,
  Turnout,
} from "@/lib/types";

export interface StoryFacts {
  house: Headline;
  sen: Headline;
  gov: Headline;
  counties: number;
  countiesTowardD: number;
  medianShift: number;
  rural: number | null;
  midMetro: number | null;
  young22: number | null;
  young26: number | null;
  indep22: number | null;
  indep26: number | null;
  hisp24: number | null;
  hisp26: number | null;
  all22: number | null;
  all26: number | null;
  behind: string[];
  behindCount: number;
  statewideCount: number;
  topTurnout: { name: string; value: number } | null;
  turnoutUp: number;
  turnoutCompared: number;
  measuresPassing: number;
  measuresTotal: number;
  featured: MeasureFeatured | null;
  township: number | null;
  countyOffices: number | null;
  localRaces: number;
}

export interface StoryData {
  house: FederalRace[];
  types: SwingByType[];
  exit: ExitShift[];
  statewide: StatewideVsPres[];
  turnout: Turnout[];
  measures: Measure[];
  contest: OfficeContest[];
}

type GraphicKey = "house" | "map" | "types" | "exit" | "exceptions" | "turnout" | "measures" | "local" | "end";

interface Chapter {
  id: string;
  kicker: string;
  title: string;
  body: ReactNode;
  graphic: GraphicKey;
  caption: string;
  more?: { href: string; label: string };
}

const B = ({ children, tone }: { children: ReactNode; tone?: "dem" | "rep" | "accent" }) => (
  <b className={`num font-medium ${tone === "dem" ? "text-dem" : tone === "rep" ? "text-rep" : tone === "accent" ? "text-accent" : "text-fg"}`}>
    {children}
  </b>
);

function chapters(f: StoryFacts): Chapter[] {
  const share = f.counties ? Math.round((100 * f.countiesTowardD) / f.counties) : 0;
  return [
    {
      id: "wave",
      kicker: "01 · The House",
      title: "A wave you can see in every district",
      graphic: "house",
      caption: "Every House race, placed by its margin. Hollow dots are not yet called.",
      body: (
        <>
          <p>
            Democrats have won <B tone="dem">{int(f.house.dem_won)}</B> House seats and lead in{" "}
            <B tone="dem">{int(f.house.dem_leading)}</B> more; Republicans have <B tone="rep">{int(f.house.rep_won)}</B> and lead in{" "}
            <B tone="rep">{int(f.house.rep_leading)}</B>. A majority is <B>218</B>.
          </p>
          <p>
            Added across every House race, the vote stands at <B tone="dem">{margin(f.house.vote_margin)}</B> on{" "}
            <B>{compact(f.house.total_votes)}</B> votes counted so far. The swarm leans right of center: most seats were not close.
          </p>
        </>
      ),
      more: { href: "/explore/races/?office=house", label: "Explore every House race" },
    },
    {
      id: "map",
      kicker: "02 · The map",
      title: "Almost every county moved the same way",
      graphic: "map",
      caption: "Shift from the 2024 presidential margin to each state's top 2026 race (Senate, else governor).",
      body: (
        <>
          <p>
            Comparing each county&apos;s top statewide race this year with how it voted for president in 2024,{" "}
            <B tone="dem">{share}%</B> of <B>{int(f.counties)}</B> counties moved toward Democrats. The median county moved{" "}
            <B tone="dem">{toward(f.medianShift)}</B>.
          </p>
          <p>Counties are compared, not districts: several states redrew their congressional maps after 2024, but county lines did not move.</p>
        </>
      ),
      more: { href: "/explore/map/", label: "Open the county map" },
    },
    {
      id: "types",
      kicker: "03 · Where",
      title: "The cities moved most, but the countryside moved too",
      graphic: "types",
      caption: "Median county shift toward Democrats, with the middle half of counties as a bar.",
      body: (
        <>
          <p>
            Mid-size metros shifted <B tone="dem">{signed(f.midMetro)}</B> points at the median; rural counties shifted{" "}
            <B tone="dem">{signed(f.rural)}</B>. The gap is real but small next to the shift itself.
          </p>
          <p>Counties with the fewest college graduates and the lowest incomes moved slightly more than the most educated and richest.</p>
        </>
      ),
      more: { href: "/explore/map/", label: "Filter the map by kind of place" },
    },
    {
      id: "exit",
      kicker: "04 · Who",
      title: "Young voters and independents broke hardest",
      graphic: "exit",
      caption: "Democratic House margin by group, NBC News exit polls. Hollow: 2022. Filled: 2026.",
      body: (
        <>
          <p>
            Voters under 30 went from <B>{margin(f.young22, 0)}</B> in 2022 to <B tone="dem">{margin(f.young26, 0)}</B>. Independents went
            from <B>{margin(f.indep22, 0)}</B> to <B tone="dem">{margin(f.indep26, 0)}</B>.
          </p>
          <p>
            Hispanic voters, who were <B>{margin(f.hisp24, 0)}</B> for president in 2024, voted <B tone="dem">{margin(f.hisp26, 0)}</B> for
            House. Overall the exit poll moved from <B>{margin(f.all22)}</B> to <B tone="dem">{margin(f.all26)}</B>.
          </p>
        </>
      ),
      more: { href: "/explore/exit/", label: "Explore the exit polls" },
    },
    {
      id: "exceptions",
      kicker: "05 · Against the tide",
      title: "Where the wave broke",
      graphic: "exceptions",
      caption: "2024 presidential margin (gray) to this year's result. Highlighted: races that ran behind 2024.",
      body: (
        <>
          <p>
            Of <B>{int(f.statewideCount)}</B> Senate and governor races, <B tone="rep">{int(f.behindCount)}</B> ran behind their state&apos;s 2024
            presidential margin. The biggest: <B>{f.behind.join(", ")}</B>.
          </p>
          <p>Candidates still matter: popular incumbents and local brands held on against a national swing.</p>
        </>
      ),
      more: { href: "/explore/races/?office=statewide", label: "Compare every statewide race" },
    },
    {
      id: "turnout",
      kicker: "06 · Turnout",
      title: "A high-turnout midterm, still being counted",
      graphic: "turnout",
      caption: "Votes in each state's largest race so far over its eligible citizens. Rises as counting finishes.",
      body: (
        <>
          <p>
            {f.topTurnout ? (
              <>
                <B>{f.topTurnout.name}</B> leads at <B tone="accent">{pct(f.topTurnout.value, 0)}</B> of eligible voters.{" "}
              </>
            ) : null}
            Already, <B tone="accent">{int(f.turnoutUp)}</B> of <B>{int(f.turnoutCompared)}</B> states are ahead of their 2022 turnout.
          </p>
          <p>
            Mail-voting states like California, Washington and Utah look low only because their ballots are still being counted.
          </p>
        </>
      ),
      more: { href: "/states/", label: "See each state" },
    },
    {
      id: "measures",
      kicker: "07 · Ballot measures",
      title: "Voters split their tickets on the issues",
      graphic: "measures",
      caption: "Each statewide measure: Yes share against the state's 2024 presidential margin.",
      body: (
        <>
          <p>
            <B tone="accent">{int(f.measuresPassing)}</B> of <B>{int(f.measuresTotal)}</B> statewide measures are passing. Their Yes share
            barely tracks how the state voted for president.
          </p>
          {f.featured && <p>{f.featured.summary}</p>}
        </>
      ),
      more: { href: "/explore/measures/", label: "Explore every measure" },
    },
    {
      id: "local",
      kicker: "08 · Down the ballot",
      title: "Most local races were never contested",
      graphic: "local",
      caption: "Share of races where no more candidates ran than there were seats.",
      body: (
        <>
          <p>
            Across <B>{int(f.localRaces)}</B> state and local races with results, <B tone="accent">{pct(f.township, 0)}</B> of township
            offices and <B tone="accent">{pct(f.countyOffices, 0)}</B> of county offices had no contest at all.
          </p>
          <p>The closest contests were often for city council and school board, where a few hundred votes decided the seat.</p>
        </>
      ),
      more: { href: "/explore/local/", label: "Explore local races" },
    },
    {
      id: "end",
      kicker: "09 · Still counting",
      title: "What this snapshot can and cannot tell you",
      graphic: "end",
      caption: "Unofficial counts; numbers move as states finish.",
      body: (
        <>
          <p>
            Every number here is unofficial and will move. New York&apos;s raw counts in the source were about three times too high, so it is left
            out of vote totals and turnout. Some states have not reported legislative results yet.
          </p>
          <p>
            <Link href="/methods/" className="text-accent underline underline-offset-4">
              Read the methods and caveats
            </Link>{" "}
            or jump into a{" "}
            <Link href="/states/" className="text-accent underline underline-offset-4">
              state page
            </Link>
            .
          </p>
        </>
      ),
    },
  ];
}

function StoryMap() {
  const geo = useJson<GeoShape[]>("geo_counties");
  const states = useJson<GeoShape[]>("geo_states");
  const swing = useJson<CountySwing[]>("county_swing");
  const by = new Map((swing.data ?? []).map((c) => [c.fips, c]));
  return (
    <div className="grid gap-2">
      <Legend
        items={[
          ...["R 20+", "R 10–20", "R 3–10", "±3", "D 3–10", "D 10–20", "D 20+"].map((l, i) => ({ color: DIVERGING[i], label: l })),
          { color: "var(--line2)", label: "no comparable race", outline: true },
        ]}
      />
      <CountyMap
        geo={geo.data}
        states={states.data}
        valueOf={(f) => by.get(f)?.shift}
        color={(v) => binColor(v, SHIFT_BREAKS)}
        tipFor={(f, name) => {
          const c = by.get(f);
          return c
            ? [
                { text: `${c.county}, ${c.state}`, head: true },
                { text: `2024 ${margin(c.m24)} → 2026 ${margin(c.m26)}` },
                { text: toward(c.shift), color: binColor(c.shift, SHIFT_BREAKS) },
              ]
            : [{ text: name, head: true }, { text: "no comparable race" }];
        }}
      />
    </div>
  );
}

function Graphic({ k, f, d }: { k: GraphicKey; f: StoryFacts; d: StoryData }) {
  switch (k) {
    case "house":
      return <RaceSwarm races={d.house} />;
    case "map":
      return <StoryMap />;
    case "types":
      return <SwingTypes rows={d.types} />;
    case "exit":
      return (
        <ExitShiftChart
          rows={d.exit.filter((e) => ["All voters", "Age", "Race", "Party and ideology"].includes(e.category))}
          compare={2022}
        />
      );
    case "exceptions":
      return (
        <Dumbbell
          fmt={tickMargin}
          rows={[...d.statewide]
            .sort((a, b) => a.over - b.over)
            .slice(0, 18)
            .map((s) => ({
              key: String(s.id),
              label: `${s.state} ${s.office === "sen" ? "SEN" : "GOV"}`,
              a: s.pres24,
              b: s.margin,
              color: partyColor(s.winner_party),
              hollow: !s.called,
              highlight: s.over < 0,
              right: `${margin(s.over)} vs '24`,
              tip: [
                { text: s.race, head: true },
                { text: `${s.dem_name ?? "—"} (D) vs ${s.rep_name ?? "—"} (R)` },
                { text: `2026 ${margin(s.margin)} · 2024 ${margin(s.pres24)}`, color: partyColor(s.winner_party) },
              ],
            }))}
        />
      );
    case "turnout": {
      const by = new Map(d.turnout.map((t) => [t.state, t]));
      return (
        <TileMap
          valueOf={(st) => by.get(st)?.turnout}
          color={(v) => `color-mix(in oklab, var(--neutral) ${Math.round(Math.min(100, Math.max(12, (v - 25) * 2.4)))}%, var(--panel2))`}
          label={(v) => `${Math.round(v)}%`}
          tipFor={(st) => {
            const t = by.get(st);
            return t
              ? [
                  { text: t.state_name, head: true },
                  { text: `${pct(t.turnout)} of ${compact(t.vep)} eligible` },
                  { text: t.turnout22 != null ? `2022: ${pct(t.turnout22)}` : "2022: n/a" },
                ]
              : [{ text: st, head: true }, { text: "no reliable count yet" }];
          }}
          hrefFor={(st) => `/states/${st.toLowerCase()}/`}
        />
      );
    }
    case "measures":
      return (
        <Scatter
          points={d.measures
            .filter((m) => m.yes_pct != null && m.pres24 != null)
            .map((m) => ({
              key: String(m.id),
              x: m.pres24 ?? 0,
              y: m.yes_pct ?? 0,
              r: m.id === f.featured?.id ? 7 : 4.5,
              color: m.id === f.featured?.id ? "var(--amber)" : "var(--neutral)",
              hollow: !m.passed,
              label: m.id === f.featured?.id ? `${m.state} ${m.name.split(" ").slice(-2).join(" ")}` : undefined,
              tip: measureTip(m),
            }))}
          yDomain={[0, 100]}
          fmtX={tickMargin}
          fmtY={(v) => `${v}%`}
          xLabel="state's 2024 presidential margin"
          yLabel="Yes share"
          refY={50}
        />
      );
    case "local":
      return (
        <BarList
          rows={d.contest.map((c) => ({
            key: c.office,
            label: c.office,
            value: c.uncontested_pct ?? 0,
            note: `of ${int(c.races)}`,
          }))}
        />
      );
    case "end":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="House D won/leading" value={int(f.house.dem_total)} tone="dem" />
          <Stat label="House R won/leading" value={int(f.house.rep_total)} tone="rep" />
          <Stat label="Senate races D/R" value={`${f.sen.dem_total}/${f.sen.rep_total}`} />
          <Stat label="Governors D/R" value={`${f.gov.dem_total}/${f.gov.rep_total}`} />
        </div>
      );
  }
}

export default function Story({ facts, data }: { facts: StoryFacts; data: StoryData }) {
  const chs = chapters(facts);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  // Active chapter = the last one whose top has passed the middle of the screen. Recomputed on scroll
  // (once per frame), so fast scrolls and jumps can't skip a chapter the way a thin observer band can.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const mid = window.innerHeight * 0.5;
      let a = 0;
      refs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top < mid) a = i;
      });
      setActive(a);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const current = chs[active];
  return (
    <div className="grid gap-8">
      <header className="grid gap-3 border-b border-line pb-6">
        <div className="num text-[11px] uppercase tracking-[0.2em] text-accent">The 2026 midterms · unofficial results</div>
        <h1 className="max-w-4xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Democrats rode a broad, nearly uniform swing to a House majority.
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-muted">
          Nine short chapters on what happened on November 3, from the national vote down to township clerks. Scroll to read; every chart
          links to an explorer where you can filter it yourself.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="House seats D · R" value={`${facts.house.dem_total} · ${facts.house.rep_total}`} sub={`${facts.house.uncalled} not yet called`} />
          <Stat label="House vote" value={margin(facts.house.vote_margin)} tone="dem" sub={`${compact(facts.house.total_votes)} votes`} />
          <Stat label="Senate races D · R" value={`${facts.sen.dem_total} · ${facts.sen.rep_total}`} sub={`of ${facts.sen.races} on the ballot`} />
          <Stat label="Governors D · R" value={`${facts.gov.dem_total} · ${facts.gov.rep_total}`} sub={`of ${facts.gov.races} on the ballot`} />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="grid gap-[30vh] pb-[30vh]">
          {chs.map((c, i) => (
            <article
              key={c.id}
              id={c.id}
              data-index={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={`grid gap-3 border-l-2 pl-4 transition-colors ${i === active ? "border-accent" : "border-line"}`}
            >
              <div className="num text-[11px] uppercase tracking-[0.18em] text-accent">{c.kicker}</div>
              <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{c.title}</h2>
              <div className="grid gap-3 text-[15px] leading-relaxed text-muted">{c.body}</div>
              {c.more && (
                <Link href={c.more.href} className="num text-xs uppercase tracking-wider text-accent hover:underline">
                  → {c.more.label}
                </Link>
              )}
              <div className="mt-2 border border-line bg-panel p-3 lg:hidden">
                <Graphic k={c.graphic} f={facts} d={data} />
                <p className="mt-2 text-xs text-dim">{c.caption}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-16 grid gap-2 border border-line bg-panel p-4">
            <div className="num flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 bg-accent" />
                {current.kicker}
              </span>
              <span className="text-dim">
                {active + 1}/{chs.length}
              </span>
            </div>
            <div key={current.id} className="fade-in max-h-[calc(100vh-11rem)] overflow-y-auto">
              <Graphic k={current.graphic} f={facts} d={data} />
            </div>
            <p className="text-xs text-dim">{current.caption}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
