import { ImageIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RichText } from "@/components/post/rich-text";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { Chip, EmptyState, PageHeader } from "@/components/ui/page";
import { loadScheduledPosts, type ScheduledOutcome, type ScheduledPost } from "@/lib/data/scheduled";
import { displayUrl } from "@/lib/text";
import { requireViewer } from "@/lib/viewer";
import { CancelScheduled } from "./cancel-scheduled";

export const metadata: Metadata = { title: "Scheduled posts" };

export default async function ScheduledPage() {
  await requireViewer("/scheduled");
  const posts = await loadScheduledPosts();
  return (
    <>
      <PageHeader title="Scheduled posts" back="/" meta="Only you can see these" />
      <p className="border-b border-hairline px-4 py-3 text-sm text-ink-muted sm:px-6">
        At its time, each post goes out like any other: posts from new members wait for review, and nothing goes out while an account is suspended. Times are in your time zone.
      </p>
      {posts.length === 0 ? (
        <EmptyState title="Nothing scheduled" action={<ButtonLink href="/" variant="outline" size="sm">Write a post</ButtonLink>}>
          Choose the clock in the composer to post later.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-hairline">
          {posts.map((post) => (
            <ScheduledRow key={post.id} post={post} />
          ))}
        </ul>
      )}
    </>
  );
}

function ScheduledRow({ post }: { post: ScheduledPost }) {
  const { outcome } = post;
  return (
    <li className="grid gap-2 px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <OutcomeLabel outcome={outcome} />
          <p className="mt-1 font-mono text-xs text-ink-muted">
            <LocalTime iso={post.scheduledAt} format="full" />
            {post.author.accountType === "organisation" ? ` · as ${post.author.displayName}` : null}
          </p>
        </div>
        {outcome.kind === "queued" ? <CancelScheduled id={post.id} label="Cancel" /> : null}
        {outcome.kind === "failed" ? <CancelScheduled id={post.id} label="Clear" /> : null}
        {outcome.kind === "posted" ? (
          <Link href={`/@${post.author.username}/posts/${outcome.postId}`} className="text-sm font-medium text-primary hover:underline">
            View post
          </Link>
        ) : null}
      </div>
      {outcome.kind === "failed" ? <p className="text-sm text-destructive">{outcome.reason}</p> : null}
      {post.body ? <RichText body={post.body} className="text-[15px]" /> : null}
      {post.pollOptions ? (
        <ul aria-label="Poll options" className="grid gap-1.5">
          {post.pollOptions.map((option) => (
            <li key={option} className="rounded-md border border-hairline px-3 py-1.5 text-[15px]">
              {option}
            </li>
          ))}
        </ul>
      ) : null}
      {post.imageCount > 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <ImageIcon className="size-4" aria-hidden />
          {post.imageCount === 1 ? "1 photo" : `${post.imageCount} photos`}
        </p>
      ) : null}
      {post.linkUrl && outcome.kind === "queued" ? <p className="font-mono text-xs text-ink-muted">Card for {displayUrl(post.linkUrl)}</p> : null}
    </li>
  );
}

function OutcomeLabel({ outcome }: { outcome: ScheduledOutcome }) {
  switch (outcome.kind) {
    case "queued":
      return <Chip tone="primary">Scheduled</Chip>;
    case "failed":
      return <Chip tone="danger">Not posted</Chip>;
    case "deleted":
      return <Chip>Posted, then deleted</Chip>;
    case "posted":
      switch (outcome.status) {
        case "published":
          return <Chip tone="primary">Posted</Chip>;
        case "pending":
          return <Chip tone="warning">Sent for review</Chip>;
        case "rejected":
          return <Chip tone="danger">Not approved</Chip>;
        default: {
          const exhaustive: never = outcome.status;
          return exhaustive;
        }
      }
    default: {
      const exhaustive: never = outcome;
      return exhaustive;
    }
  }
}
