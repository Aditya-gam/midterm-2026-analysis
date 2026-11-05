import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import StateView from "@/components/views/StateView";
import { load } from "@/lib/server";
import type { FederalRace, Legislature, Measure, StateInfo, StatewideVsPres, Turnout } from "@/lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return load<StateInfo[]>("states").map((s) => ({ st: s.state.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ st: string }> }): Promise<Metadata> {
  const { st } = await params;
  const info = load<StateInfo[]>("states").find((s) => s.state === st.toUpperCase());
  return { title: `${info?.name ?? st.toUpperCase()} · Midterm/26 Atlas` };
}

export default async function Page({ params }: { params: Promise<{ st: string }> }) {
  const { st } = await params;
  const code = st.toUpperCase();
  const info = load<StateInfo[]>("states").find((s) => s.state === code);
  if (!info) notFound();
  const races = load<FederalRace[]>("races_federal").filter((r) => r.state === code);
  const statewide = load<StatewideVsPres[]>("statewide_vs_pres").filter((r) => r.state === code);
  const measures = load<Measure[]>("measures_statewide").filter((m) => m.state === code);
  const legislature = load<Legislature[]>("state_legislatures").filter((l) => l.state === code);
  const turnout = load<Turnout[]>("turnout_state").find((t) => t.state === code) ?? null;

  return (
    <div className="grid gap-5">
      <PageHeader kicker={`States · ${code}`} title={info.name}>
        {info.has_sen || info.has_gov
          ? `On the ballot: ${[info.has_sen && "U.S. Senate", info.has_gov && "governor", `${info.house_seats} House seat${info.house_seats === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(", ")}, plus ${info.local_races.toLocaleString("en-US")} state and local contests.`
          : `${info.house_seats} House seat${info.house_seats === 1 ? "" : "s"} and ${info.local_races.toLocaleString("en-US")} state and local contests.`}{" "}
        <Link href="/states/" className="text-accent underline underline-offset-2">
          All states
        </Link>
      </PageHeader>
      <StateView info={info} races={races} statewide={statewide} measures={measures} legislature={legislature} turnout={turnout} />
    </div>
  );
}
