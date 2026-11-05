// Shapes of the JSON files in public/data (written by pipeline/build_results.py and export_web.py).

export type Party = "D" | "R" | "O";
export type Office = "house" | "sen" | "gov";

export interface Headline {
  office: Office;
  races: number;
  dem_won: number;
  rep_won: number;
  other_won: number;
  dem_leading: number;
  rep_leading: number;
  dem_total: number;
  rep_total: number;
  uncalled: number;
  with_results: number;
  dem_votes: number;
  rep_votes: number;
  total_votes: number;
  vote_margin: number | null;
  vote_note: string;
  /** states whose raw vote counts in the source are implausible; left out of vote totals */
  excluded: string[];
  as_of: string;
}

export interface FederalRace {
  id: number;
  state: string;
  state_name: string;
  office: Office;
  district: number | null;
  race: string;
  dem_name: string | null;
  dem_votes: number;
  rep_name: string | null;
  rep_votes: number;
  dem_pct: number | null;
  rep_pct: number | null;
  margin: number | null;
  signed_margin: number | null;
  winner_name: string | null;
  winner_party: Party | null;
  called: boolean;
  lead_gap: number | null;
  n_cands: number;
  total: number;
  reporting: number | null;
}

export interface CountySwing {
  fips: string;
  state: string;
  county: string;
  office: "sen" | "gov";
  votes: number;
  m26: number;
  m24: number;
  shift: number;
  reporting: number | null;
  bachelors_pct: number | null;
  median_income: number | null;
  area: string | null;
}

export interface SwingByType {
  dimension: string;
  group: string;
  order: number;
  counties: number;
  median_shift: number;
  p25: number;
  p75: number;
  weighted_shift: number;
}

export interface GeoShape {
  fips: string;
  name: string;
  d: string;
}

export interface StatewideVsPres {
  id: number;
  state: string;
  state_name: string;
  office: "sen" | "gov";
  race: string;
  dem_name: string | null;
  rep_name: string | null;
  margin: number;
  pres24: number;
  over: number;
  reporting: number | null;
  winner_party: Party | null;
  called: boolean;
}

export interface Turnout {
  state: string;
  state_name: string;
  votes: number;
  vep: number;
  turnout: number;
  turnout22: number | null;
  change: number | null;
  basis: string;
  reporting: number | null;
  closest_margin: number | null;
}

export interface Measure {
  id: number;
  state: string;
  state_name: string;
  name: string;
  kind: string;
  title: string | null;
  description: string | null;
  topic: string;
  yes_votes: number;
  no_votes: number;
  yes_pct: number | null;
  threshold: number;
  passed: boolean;
  status: string;
  reporting: number | null;
  pres24: number | null;
  has_counties: boolean;
}

export interface LocalMeasures {
  kind: string;
  measures: number;
  passed: number;
  failed: number;
  pass_rate: number | null;
}

export interface MeasureFeatured {
  id: number;
  name: string;
  title: string;
  state: string;
  yes_pct: number;
  pres24: number;
  county_corr: number;
  summary: string;
}

export interface MeasureCounty {
  fips: string;
  county: string;
  yes_pct: number;
  votes: number;
  trump24: number;
}

export interface OfficeContest {
  office: string;
  races: number;
  uncontested: number;
  uncontested_pct: number | null;
  close_pct: number | null;
  measured: number;
  median_margin: number | null;
}

export interface OfficeByState {
  state: string;
  office: string;
  races: number;
  uncontested: number;
  measured: number;
  close: number;
}

export interface MarginBin {
  state?: string;
  office: string;
  bin: number;
  races: number;
}

export interface Legislature {
  state: string;
  state_name: string;
  chamber: string;
  seats: number;
  dem: number;
  rep: number;
  other: number;
  races_called: number;
  races_leading: number;
}

export interface ExitShift {
  category: string;
  group: string;
  order: number;
  year: number;
  contest: string;
  share: number | null;
  dem: number;
  rep: number;
  margin: number;
}

export interface ExitAnswer {
  answer: string;
  order: number;
  share: number;
  dem: number;
  rep: number;
  margin: number;
  year?: number;
}

export interface StateInfo {
  state: string;
  name: string;
  fips: string;
  local_races: number;
  federal_races: number;
  house_seats: number;
  has_sen: boolean;
  has_gov: boolean;
  turnout: number | null;
}

/** [name, party, votes, share of votes, winner flag] */
export type LocalCandidate = [string, Party, number, number | null, boolean];

export interface LocalRace {
  id: number;
  name: string;
  type: string | null;
  group: string;
  place: string;
  reporting: number | null;
  seats: number;
  total: number;
  cands: LocalCandidate[];
}
