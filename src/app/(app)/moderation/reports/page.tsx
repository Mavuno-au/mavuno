import { ReportQueue } from "@/components/moderation/report-queue";
import { loadReportQueue } from "@/lib/data/moderation";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  return <ReportQueue groups={await loadReportQueue()} />;
}
