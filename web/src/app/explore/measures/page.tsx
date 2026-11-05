import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import MeasuresExplorer from "@/components/views/MeasuresExplorer";
import { load } from "@/lib/server";
import type { LocalMeasures, Measure, MeasureCounty, MeasureFeatured } from "@/lib/types";

export const metadata: Metadata = { title: "Ballot measures · Midterm/26 Atlas" };

export default function Page() {
  return (
    <div className="grid gap-5">
      <PageHeader kicker="Explore · ballot measures" title="What voters decided directly">
        Statewide questions by topic, Yes share and status, plus judicial retention votes and local ballot questions. Most need a simple
        majority; Florida amendments need 60%, Colorado amendments 55%, New Hampshire constitutional questions two-thirds. Measures listed only
        by number in both sources are &ldquo;Not described in source&rdquo;.
      </PageHeader>
      <Suspense>
        <MeasuresExplorer
          measures={load<Measure[]>("measures_statewide")}
          local={load<LocalMeasures[]>("measures_local")}
          featured={load<MeasureFeatured[]>("measure_featured")[0] ?? null}
          counties={load<MeasureCounty[]>("measure_counties")}
        />
      </Suspense>
    </div>
  );
}
