import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import StatesIndex from "@/components/views/StatesIndex";
import { load } from "@/lib/server";
import type { StateInfo, StatewideVsPres, Turnout } from "@/lib/types";

export const metadata: Metadata = { title: "States · Midterm/26 Atlas" };

export default function Page() {
  return (
    <div className="grid gap-5">
      <PageHeader kicker="States" title="Every state, every race">
        Each state page has its federal and governor races, a county map, ballot measures, legislative seats and every local race civicAPI
        reported.
      </PageHeader>
      <Suspense>
        <StatesIndex states={load<StateInfo[]>("states")} turnout={load<Turnout[]>("turnout_state")} statewide={load<StatewideVsPres[]>("statewide_vs_pres")} />
      </Suspense>
    </div>
  );
}
