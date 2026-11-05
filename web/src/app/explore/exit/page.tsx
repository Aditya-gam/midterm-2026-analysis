import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import ExitExplorer from "@/components/views/ExitExplorer";
import { load } from "@/lib/server";
import type { ExitAnswer, ExitShift } from "@/lib/types";

export const metadata: Metadata = { title: "Exit polls · Midterm/26 Atlas" };

export default function Page() {
  return (
    <div className="grid gap-5">
      <PageHeader kicker="Explore · exit polls" title="Who voted, and how they voted">
        NBC News national exit polls. 2022 and 2026 asked about the House vote; 2024 asked about the presidential vote, so compare with it for
        context only. Methods change between years, so treat small differences as noise. Black and Hispanic figures are averaged from NBC&apos;s
        per-group tables.
      </PageHeader>
      <Suspense>
        <ExitExplorer
          shift={load<ExitShift[]>("exit_shift")}
          flow={load<ExitAnswer[]>("exit_flow")}
          issue={load<ExitAnswer[]>("exit_issue")}
          approval={load<ExitAnswer[]>("exit_approval")}
          age={load<ExitAnswer[]>("exit_age_mix")}
        />
      </Suspense>
    </div>
  );
}
