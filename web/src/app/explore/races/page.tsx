import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import RacesExplorer from "@/components/views/RacesExplorer";
import { load } from "@/lib/server";
import type { FederalRace, Headline, StatewideVsPres } from "@/lib/types";

export const metadata: Metadata = { title: "Races · Midterm/26 Atlas" };

export default function Page() {
  const races = load<FederalRace[]>("races_federal");
  const statewide = load<StatewideVsPres[]>("statewide_vs_pres");
  return (
    <div className="grid gap-5">
      <PageHeader kicker="Explore · federal and governor races" title="Every House, Senate and governor race">
        Filter by office, state, call status, winner and margin. Filters are kept in the address bar, so any view can be shared. Margins are
        Democratic minus Republican share of all votes; uncontested races sit at the far edges.
      </PageHeader>
      <Suspense>
        <RacesExplorer races={races} statewide={statewide} excluded={load<Headline[]>("headline")[0]?.excluded ?? []} />
      </Suspense>
    </div>
  );
}
