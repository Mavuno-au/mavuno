import type { ReactNode } from "react";
import { EventAttachment, ImageGrid, LinkCard, OpportunityAttachment, QuotedBlock } from "@/components/post/attachments";
import { RichText } from "@/components/post/rich-text";
import { Translation } from "@/components/post/translation";
import { LocalTime } from "@/components/ui/local-time";
import { EVENT_CATEGORIES, EVENT_FORMATS, OPPORTUNITY_TYPES, POLL_DURATIONS } from "@/lib/catalogue";
import type { ParentContext, PostPreview, ReviewEvent, ReviewOpportunity, ReviewSubject } from "@/lib/data/moderation";
import type { Poll } from "@/lib/domain";
import { count, eventDate } from "@/lib/format";
import { displayUrl } from "@/lib/text";

const BODY = "text-[15px] leading-relaxed";

function ParentLine({ parent }: { parent: ParentContext }) {
  switch (parent.kind) {
    case "post":
      return (
        <p className="mt-2 line-clamp-2 font-mono text-xs text-ink-muted">
          ↳ replying to @{parent.username}
          {parent.excerpt ? (
            <>
              : <bdi>{parent.excerpt}</bdi>
            </>
          ) : null}
        </p>
      );
    case "gone":
      return <p className="mt-2 font-mono text-xs text-ink-muted">↳ replying to a post that is gone</p>;
    default: {
      const exhaustive: never = parent;
      return exhaustive;
    }
  }
}

function PollSummary({ poll }: { poll: Poll }) {
  const duration = POLL_DURATIONS.find((option) => option.hours === poll.durationHours)?.label ?? count(poll.durationHours, "hour");
  return (
    <div className="mt-3 grid gap-1.5">
      <ul className="grid gap-1.5">
        {poll.options.map((option) => (
          <li key={option.id} className="flex h-9 items-center justify-between gap-3 rounded-md bg-wash px-3 text-[15px]">
            <span className="truncate">{option.label}</span>
            {option.votes !== null ? <span className="shrink-0 font-mono text-[13px] tabular">{count(option.votes, "vote")}</span> : null}
          </li>
        ))}
      </ul>
      <p className="font-mono text-xs text-ink-muted">
        Poll · {poll.closesAt ? count(poll.votes, "vote") : `runs ${duration} once published`}
      </p>
    </div>
  );
}

export function PostPreviewBlock({ preview: { post, parent } }: { preview: PostPreview }) {
  return (
    <div className="mt-3">
      {post.space ? (
        <p className="font-mono text-xs text-ink-muted">
          {post.space.emoji} {post.space.name}
        </p>
      ) : null}
      {parent ? <ParentLine parent={parent} /> : null}
      {post.body ? (
        <div className="mt-2">
          <Translation post={post} review render={(text) => <RichText body={text} className={BODY} />} />
        </div>
      ) : null}
      {post.images.length > 0 ? <ImageGrid images={post.images} /> : null}
      {post.poll ? <PollSummary poll={post.poll} /> : null}
      {post.linkUrl && post.images.length === 0 && !post.quoted ? <LinkCard url={post.linkUrl} preview={post.linkPreview} /> : null}
      {post.quoted ? <QuotedBlock quoted={post.quoted} /> : null}
      {post.event ? <EventAttachment event={post.event} /> : null}
      {post.opportunity ? <OpportunityAttachment opportunity={post.opportunity} /> : null}
    </div>
  );
}

function ExternalUrl({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" title={href} className="block truncate text-primary hover:underline">
      {displayUrl(href)}
    </a>
  );
}

function Facts({ facts }: { facts: [label: string, value: ReactNode][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const present = (fact: [string, ReactNode]) => fact[1] !== null && fact[1] !== "";

function EventPreview({ event }: { event: ReviewEvent }) {
  const when = event.endsAt ? `${eventDate(event.startsAt, event.timezone)} to ${eventDate(event.endsAt, event.timezone)}` : eventDate(event.startsAt, event.timezone);
  const facts: [string, ReactNode][] = [
    ["When", when],
    ["Where", [EVENT_FORMATS[event.format], event.place].filter(Boolean).join(" · ")],
    ["Online link", event.onlineUrl ? <ExternalUrl href={event.onlineUrl} /> : null],
    ["Tickets", event.ticketUrl ? <ExternalUrl href={event.ticketUrl} /> : null],
    ["Cost", event.free ? "Free" : "Paid"],
    ["Capacity", event.capacity === null ? null : count(event.capacity, "person", "people")],
    ["Category", EVENT_CATEGORIES[event.category]],
  ];
  return (
    <div className="mt-3">
      {event.coverUrl ? <img src={event.coverUrl} alt="" loading="lazy" decoding="async" className="mb-3 aspect-[2/1] w-full rounded-lg border border-hairline bg-wash object-cover" /> : null}
      <h3 className="text-[15px] font-semibold">{event.title}</h3>
      <Facts facts={facts.filter(present)} />
      {event.description ? <RichText body={event.description} className={`mt-2 ${BODY}`} /> : null}
    </div>
  );
}

function OpportunityPreview({ opportunity }: { opportunity: ReviewOpportunity }) {
  const facts: [string, ReactNode][] = [
    ["Type", OPPORTUNITY_TYPES[opportunity.type].label],
    ["Organisation", opportunity.organisation],
    ["Where", opportunity.place],
    ["Apply by", opportunity.deadlineAt ? <LocalTime iso={opportunity.deadlineAt} format="full" /> : null],
    ["Pay", opportunity.compensation],
    ["Apply link", opportunity.applyUrl ? <ExternalUrl href={opportunity.applyUrl} /> : null],
    ["Apply email", opportunity.applyEmail],
  ];
  return (
    <div className="mt-3">
      <h3 className="text-[15px] font-semibold">{opportunity.title}</h3>
      <Facts facts={facts.filter(present)} />
      <RichText body={opportunity.description} className={`mt-2 ${BODY}`} />
    </div>
  );
}

export function SubjectPreview({ subject }: { subject: ReviewSubject }) {
  switch (subject.kind) {
    case "post":
      return <PostPreviewBlock preview={subject.preview} />;
    case "event":
      return <EventPreview event={subject.event} />;
    case "opportunity":
      return <OpportunityPreview opportunity={subject.opportunity} />;
    case "text":
      return (
        <p dir="auto" className={`mt-3 break-words whitespace-pre-wrap ${BODY}`}>
          {subject.content}
        </p>
      );
    default: {
      const exhaustive: never = subject;
      return exhaustive;
    }
  }
}
