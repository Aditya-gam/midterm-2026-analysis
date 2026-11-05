import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import MapExplorer from "@/components/views/MapExplorer";
import { load } from "@/lib/server";
import type { StateInfo, SwingByType } from "@/lib/types";

export const metadata: Metadata = { title: "County map · Midterm/26 Atlas" };

export default function Page() {
  return (
    <div className="grid gap-5">
      <PageHeader kicker="Explore · counties" title="How every county moved since 2024">
        Each county&apos;s top statewide race this year (Senate where there is one with both parties, otherwise governor) against its 2024
        presidential vote. Pick a state to zoom in, or a kind of place to highlight. Alaska reports 2024 by legislative district, so it has no
        county comparison.
      </PageHeader>
      <Suspense>
        <MapExplorer states={load<StateInfo[]>("states")} types={load<SwingByType[]>("swing_by_type")} />
      </Suspense>
    </div>
  );
}
