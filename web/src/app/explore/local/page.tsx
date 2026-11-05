import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import LocalExplorer from "@/components/views/LocalExplorer";
import { load } from "@/lib/server";
import type { Legislature, MarginBin, OfficeByState, StateInfo } from "@/lib/types";

export const metadata: Metadata = { title: "Local races · Midterm/26 Atlas" };

export default function Page() {
  return (
    <div className="grid gap-5">
      <PageHeader kicker="Explore · state and local" title="The races below the top of the ticket">
        Legislatures, county offices, mayors, councils, school boards, judges and township offices. Party labels exist mainly for legislative
        and county races; most city, school and judicial races are nonpartisan, so this page measures competition, not party. Some states had no
        legislative counts in the source yet.
      </PageHeader>
      <Suspense>
        <LocalExplorer
          states={load<StateInfo[]>("states")}
          offices={load<OfficeByState[]>("office_by_state")}
          margins={load<MarginBin[]>("margins_by_state")}
          legislatures={load<Legislature[]>("state_legislatures")}
        />
      </Suspense>
    </div>
  );
}
