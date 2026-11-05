import type { Party } from "./types";

const nf = new Intl.NumberFormat("en-US");
const compactNf = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const int = (v: number | null | undefined): string => (v == null ? "—" : nf.format(v));
export const compact = (v: number | null | undefined): string =>
  v == null ? "—" : v >= 10000 ? compactNf.format(v) : nf.format(v);
export const pct = (v: number | null | undefined, digits = 1): string => (v == null ? "—" : `${v.toFixed(digits)}%`);

/** Signed margin in points: positive = Democratic lead. */
export const margin = (m: number | null | undefined, digits = 1): string =>
  m == null ? "—" : Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "D" : "R"}+${Math.abs(m).toFixed(digits)}`;

export const tickMargin = (t: number): string => (t === 0 ? "EVEN" : `${t > 0 ? "D" : "R"}+${Math.abs(t)}`);

export const toward = (s: number | null | undefined): string =>
  s == null ? "—" : Math.abs(s) < 0.05 ? "no change" : `${Math.abs(s).toFixed(1)} pts toward ${s > 0 ? "Dems" : "GOP"}`;

export const signed = (v: number | null | undefined, digits = 1): string =>
  v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`;

export const partyColor = (p: Party | null | undefined): string =>
  p === "D" ? "var(--dem)" : p === "R" ? "var(--rep)" : "var(--oth)";

export const partyName = (p: Party | null | undefined): string =>
  p === "D" ? "Democrat" : p === "R" ? "Republican" : "Other";

export const asOf = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });

/** Seven diverging classes for margins and shifts (index 0 = most Republican, 6 = most Democratic). */
export const DIVERGING = ["var(--r1)", "var(--r2)", "var(--r3)", "var(--mid)", "var(--d3)", "var(--d2)", "var(--d1)"];

export function binColor(v: number | null | undefined, breaks: number[]): string {
  if (v == null || Number.isNaN(v)) return "transparent";
  let i = 0;
  while (i < breaks.length && v >= breaks[i]) i += 1;
  return DIVERGING[i];
}

export const SHIFT_BREAKS = [-20, -10, -3, 3, 10, 20];
export const MARGIN_BREAKS = [-40, -20, -5, 5, 20, 40];
