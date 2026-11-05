import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AskView } from "@/components/views/AskView";

export const metadata: Metadata = { title: "Ask the data · Midterm/26 Atlas" };

export default function AskPage() {
  return (
    <div className="grid gap-6">
      <PageHeader kicker="Ask" title="Ask the data">
        Type a question about the 2026 results and get an answer with a chart. Three Claude agents work on it: an analyst writes and runs SQL
        against the same database this site is built from, a designer picks the chart, and a reviewer checks the numbers and caveats before you
        see them. Follow-up questions build on the previous answer.
      </PageHeader>
      <AskView />
    </div>
  );
}
