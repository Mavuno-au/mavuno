import Link from "next/link";
import { ShareRow } from "@/components/operations/figures";
import { RangePicker } from "@/components/operations/range-picker";
import { EmptyState, Section } from "@/components/ui/page";
import { type Activity, loadActivity } from "@/lib/data/operations";
import { parseRange } from "@/lib/metrics";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const COMPARED: { key: keyof Activity["compare"]; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "replies", label: "Replies" },
  { key: "signups", label: "Sign-ups" },
  { key: "messages", label: "Messages" },
  { key: "reports", label: "Reports" },
];

const STATUS_LABELS: Record<Activity["statuses"][number]["status"], string> = {
  published: "Published",
  pending: "Waiting for review",
  rejected: "Removed by a moderator",
  deleted: "Deleted",
};

export default async function ActivityPage({ searchParams }: PageProps<"/operations/activity">) {
  const range = parseRange((await searchParams).range);
  const { days, compare, statuses, authors } = await loadActivity(range);
  const written = statuses.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <>
      <RangePicker range={range} path="/operations/activity" />

      <Section title="Today" meta="against yesterday, Sydney days">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="text-left text-sm text-ink-muted">
              <th scope="col" className="pb-2 font-normal">
                <span className="sr-only">What</span>
              </th>
              <th scope="col" className="pb-2 text-right font-normal">Today</th>
              <th scope="col" className="pb-2 text-right font-normal">Yesterday</th>
            </tr>
          </thead>
          <tbody>
            {COMPARED.map(({ key, label }) => (
              <tr key={key} className="border-t border-hairline">
                <th scope="row" className="py-2 text-left font-normal">{label}</th>
                <td className="py-2 text-right font-mono font-semibold tabular">{compare[key].today}</td>
                <td className="py-2 text-right font-mono text-ink-muted tabular">{compare[key].yesterday}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Posts by status" meta={`${written} written in the last ${days} days`}>
        <div className="grid gap-4">
          {statuses.map((entry) => (
            <ShareRow key={entry.status} label={STATUS_LABELS[entry.status]} part={entry.count} whole={written} />
          ))}
        </div>
      </Section>

      <Section title="Busiest authors" meta={`published in the last ${days} days`} className="border-b-0">
        {authors.length === 0 ? (
          <EmptyState title="No posts yet">Nobody has published in this range.</EmptyState>
        ) : (
          <ol className="grid">
            {authors.map((author, index) => (
              <li key={author.username} className="flex items-center gap-3 border-b border-hairline py-2 last:border-b-0">
                <span className="w-5 shrink-0 text-right font-mono text-xs text-ink-muted tabular">{index + 1}</span>
                <Link href={`/@${author.username}`} className="min-w-0 flex-1 truncate hover:underline">
                  <span className="font-medium">{author.displayName || author.username}</span>{" "}
                  <span className="font-mono text-sm text-ink-muted">@{author.username}</span>
                </Link>
                <span className="shrink-0 font-mono text-sm font-semibold tabular">{author.posts}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
