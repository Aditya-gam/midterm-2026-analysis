import Story, { type StoryData, type StoryFacts } from "@/components/views/Story";
import { load } from "@/lib/server";
import type {
  CountySwing,
  ExitShift,
  FederalRace,
  Headline,
  Measure,
  MeasureFeatured,
  OfficeContest,
  StatewideVsPres,
  SwingByType,
  Turnout,
} from "@/lib/types";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};

export default function Page() {
  const headline = load<Headline[]>("headline");
  const races = load<FederalRace[]>("races_federal");
  const swing = load<CountySwing[]>("county_swing");
  const types = load<SwingByType[]>("swing_by_type");
  const exit = load<ExitShift[]>("exit_shift");
  const statewide = load<StatewideVsPres[]>("statewide_vs_pres");
  const turnout = load<Turnout[]>("turnout_state");
  const measures = load<Measure[]>("measures_statewide");
  const featured = load<MeasureFeatured[]>("measure_featured")[0] ?? null;
  const contest = load<OfficeContest[]>("office_contest");

  const by = (o: string) => headline.find((h) => h.office === o)!;
  const exitOf = (g: string, y: number) => exit.find((e) => e.group === g && e.year === y)?.margin ?? null;
  const typeOf = (g: string) => types.find((t) => t.group === g)?.median_shift ?? null;
  const ballot = measures.filter((m) => m.kind === "Ballot measure");
  const tSorted = [...turnout].sort((a, b) => b.turnout - a.turnout);
  const behind = statewide.filter((s) => s.over < 0).sort((a, b) => a.over - b.over);

  const facts: StoryFacts = {
    house: by("house"),
    sen: by("sen"),
    gov: by("gov"),
    counties: swing.length,
    countiesTowardD: swing.filter((c) => c.shift > 0).length,
    medianShift: median(swing.map((c) => c.shift)),
    rural: typeOf("Rural"),
    midMetro: typeOf("Mid-size metro"),
    young22: exitOf("18–29", 2022),
    young26: exitOf("18–29", 2026),
    indep22: exitOf("Independents", 2022),
    indep26: exitOf("Independents", 2026),
    hisp24: exitOf("Hispanic/Latino", 2024),
    hisp26: exitOf("Hispanic/Latino", 2026),
    all22: exitOf("All voters", 2022),
    all26: exitOf("All voters", 2026),
    behind: behind.slice(0, 3).map((s) => `${s.state_name} ${s.office === "sen" ? "Senate" : "governor"}`),
    behindCount: behind.length,
    statewideCount: statewide.length,
    topTurnout: tSorted[0] ? { name: tSorted[0].state_name, value: tSorted[0].turnout } : null,
    turnoutUp: turnout.filter((t) => (t.change ?? 0) > 0).length,
    turnoutCompared: turnout.filter((t) => t.change != null).length,
    measuresPassing: ballot.filter((m) => m.passed).length,
    measuresTotal: ballot.length,
    featured,
    township: contest.find((c) => c.office === "Township offices")?.uncontested_pct ?? null,
    countyOffices: contest.find((c) => c.office === "County offices")?.uncontested_pct ?? null,
    localRaces: contest.reduce((s, c) => s + c.races, 0),
  };

  const data: StoryData = {
    house: races.filter((r) => r.office === "house"),
    types,
    exit,
    statewide,
    turnout,
    measures: ballot,
    contest,
  };

  return <Story facts={facts} data={data} />;
}
