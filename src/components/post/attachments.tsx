"use client";

import { Briefcase, CalendarDays, MapPin, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadLinkPreview } from "@/app/actions/posts";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { LocalTime } from "@/components/ui/local-time";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { cn } from "@/lib/cn";
import type { EventSummary, LinkPreview, OpportunitySummary, PostImage, QuotedPost } from "@/lib/domain";
import { embedFor } from "@/lib/embeds";
import { eventDate } from "@/lib/format";
import { displayUrl } from "@/lib/text";

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

export function ImageGrid({ images }: { images: PostImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const current = open === null ? undefined : images[open];
  const layout = ["", "grid-cols-1", "grid-cols-2", "grid-cols-2 grid-rows-2", "grid-cols-2 grid-rows-2"][images.length];
  const label = (index: number) => images[index]?.alt || (images.length > 1 ? `Photo ${index + 1} of ${images.length}` : "Photo");
  const step = (by: number) => setOpen((index) => (index === null ? null : Math.min(images.length - 1, Math.max(0, index + by))));

  return (
    <>
      <div className={cn("mt-3 grid gap-0.5 overflow-hidden rounded-lg border border-hairline", layout, images.length > 1 && "aspect-[16/10]")}>
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            aria-label={`Open ${label(index)}`}
            onClick={(event) => {
              stop(event);
              setOpen(index);
            }}
            className={cn("relative block min-h-0 bg-wash", images.length === 3 && index === 0 && "row-span-2")}
          >
            <img
              src={image.url}
              alt={image.alt}
              loading="lazy"
              decoding="async"
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              className={cn("size-full object-cover", images.length === 1 && "max-h-[32rem] w-full")}
            />
            {image.alt ? <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1 font-mono text-[10px] font-medium text-white">ALT</span> : null}
          </button>
        ))}
      </div>
      <Dialog open={current !== undefined} onClose={() => setOpen(null)} title={images.length > 1 ? `Photo ${(open ?? 0) + 1} of ${images.length}` : "Photo"} className="max-w-4xl">
        {current ? (
          <figure
            className="grid gap-3"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") step(-1);
              if (event.key === "ArrowRight") step(1);
            }}
          >
            <img src={current.url} alt={current.alt || label(open ?? 0)} className="max-h-[70dvh] w-full rounded-md object-contain" />
            {current.alt ? <figcaption className="text-sm text-ink-muted">{current.alt}</figcaption> : null}
            <div className="flex items-center justify-between gap-3 text-sm">
              {images.length > 1 ? (
                <button type="button" className="text-primary disabled:opacity-40" disabled={open === 0} onClick={() => step(-1)}>
                  ← Previous
                </button>
              ) : (
                <span />
              )}
              <a href={current.url} download target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-ink">
                Download
              </a>
              {images.length > 1 ? (
                <button type="button" className="text-primary disabled:opacity-40" disabled={open === images.length - 1} onClick={() => step(1)}>
                  Next →
                </button>
              ) : (
                <span />
              )}
            </div>
          </figure>
        ) : null}
      </Dialog>
    </>
  );
}

// The server fetches a card after the post is made. Posts made in this tab
// are remembered by their link, so their card can wait for it a little while.
const awaitedCards = new Map<string, string>();
const CARD_DELAYS = [1000, 2000, 3000, 5000, 8000, 13000];

export function awaitCard(url: string, postId: string) {
  awaitedCards.set(url, postId);
}

function useLateCard(url: string, preview: LinkPreview | null) {
  const [postId] = useState(() => (preview ? undefined : awaitedCards.get(url)));
  const [late, setLate] = useState<{ kind: "waiting" } | { kind: "arrived"; preview: LinkPreview } | { kind: "none" }>(() =>
    postId ? { kind: "waiting" } : { kind: "none" },
  );

  useEffect(() => {
    if (!postId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async (attempt: number) => {
      const found = await loadLinkPreview(postId).catch(() => null);
      if (stopped) return;
      const last = attempt + 1 >= CARD_DELAYS.length;
      if (found || last) {
        awaitedCards.delete(url);
        setLate(found ? { kind: "arrived", preview: found } : { kind: "none" });
      } else {
        timer = setTimeout(() => void poll(attempt + 1), CARD_DELAYS[attempt + 1]);
      }
    };
    timer = setTimeout(() => void poll(0), CARD_DELAYS[0]);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [postId, url]);

  return { preview: late.kind === "arrived" ? late.preview : preview, waiting: late.kind === "waiting" };
}

// Third-party players load only after a click, so reading a feed never contacts them.
export function LinkCard({ url, preview: stored }: { url: string; preview: LinkPreview | null }) {
  const embed = embedFor(url);
  const [playing, setPlaying] = useState(false);
  const { preview, waiting } = useLateCard(url, stored);

  if (embed && playing) {
    const shape = { video: "aspect-video", portrait: "aspect-[9/16] max-h-[36rem] mx-auto", audio: "h-[152px]" }[embed.shape];
    return (
      <div className="mt-3 overflow-hidden rounded-lg border border-hairline bg-black" onClick={stop}>
        <iframe
          src={embed.src}
          title={preview?.title ?? `${embed.provider} player`}
          className={cn("w-full", shape)}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (!preview && !embed) {
    if (!waiting) return null;
    return (
      <div className="mt-3 grid gap-1.5 rounded-lg border border-hairline px-3 py-2.5" aria-busy="true">
        <span className="sr-only">Loading the link preview</span>
        <span className="font-mono text-xs text-ink-muted">{displayUrl(url)}</span>
        <span className="h-4 w-3/4 animate-pulse rounded bg-wash" />
        <span className="h-3.5 w-full animate-pulse rounded bg-wash" />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(event) => {
        stop(event);
        if (embed) {
          event.preventDefault();
          setPlaying(true);
        }
      }}
      className="mt-3 block overflow-hidden rounded-lg border border-hairline transition-colors hover:bg-wash"
    >
      {preview?.image ? (
        <div className="relative aspect-[1.91/1] bg-wash">
          <img src={preview.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" />
          {embed ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-black/70 text-white">
                <Play className="ml-0.5 size-6 fill-current" />
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-0.5 px-3 py-2.5">
        <span className="font-mono text-xs text-ink-muted">{embed ? `${embed.provider} · play here` : (preview?.siteName ?? displayUrl(url))}</span>
        {preview?.title ? <span className="line-clamp-2 text-[15px] font-medium">{preview.title}</span> : null}
        {preview?.description ? <span className="line-clamp-2 text-sm text-ink-muted">{preview.description}</span> : null}
      </div>
    </a>
  );
}

export function QuotedBlock({ quoted }: { quoted: QuotedPost }) {
  if (quoted.kind !== "post") {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-rail px-3 py-2.5 text-sm text-ink-muted">
        <span className="font-mono">[{quoted.kind}]</span> {quoted.kind === "deleted" ? "This post was deleted." : "This post isn't available."}
      </div>
    );
  }
  return (
    <Link href={`/@${quoted.author.username}/posts/${quoted.id}`} onClick={stop} className="mt-3 block rounded-lg border border-hairline px-3 py-2.5 transition-colors hover:bg-wash">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <Avatar person={quoted.author} size="xs" />
        <span className="truncate font-semibold">{quoted.author.displayName}</span>
        <span className="truncate font-mono text-[13px] text-ink-muted">@{quoted.author.username}</span>
        <span className="font-mono text-[13px] text-ink-muted">· <LocalTime iso={quoted.createdAt} /></span>
      </span>
      {quoted.body ? <p className="mt-1 line-clamp-6 text-[15px] whitespace-pre-wrap wrap-anywhere">{quoted.body}</p> : null}
      {quoted.image ? <img src={quoted.image.url} alt={quoted.image.alt} loading="lazy" className="mt-2 max-h-48 rounded-md object-cover" /> : null}
    </Link>
  );
}

export function EventAttachment({ event }: { event: EventSummary }) {
  return (
    <Link href={`/events/${event.id}`} onClick={stop} className="mt-3 flex gap-3 rounded-lg border border-hairline p-3 transition-colors hover:bg-wash">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <CalendarDays className="size-5" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate font-medium">{event.title}</span>
        <span className="text-sm text-ink-muted">{event.cancelled ? "Cancelled" : eventDate(event.startsAt, event.timezone)}</span>
        <span className="flex min-w-0 items-center gap-1 text-sm text-ink-muted">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {event.format === "online" ? "Online" : [event.venue, event.city].filter(Boolean).join(", ")}
            {event.going > 0 ? ` · ${event.going} going` : ""}
          </span>
        </span>
      </span>
    </Link>
  );
}

export function OpportunityAttachment({ opportunity }: { opportunity: OpportunitySummary }) {
  return (
    <Link href={`/opportunities/${opportunity.id}`} onClick={stop} className="mt-3 flex gap-3 rounded-lg border border-hairline p-3 transition-colors hover:bg-wash">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Briefcase className="size-5" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate font-medium">{opportunity.title}</span>
        <span className="truncate text-sm text-ink-muted">
          {[OPPORTUNITY_TYPES[opportunity.type].label, opportunity.organisation, opportunity.remote ? "Remote" : opportunity.city].filter(Boolean).join(" · ")}
        </span>
        <span className="text-sm text-ink-muted">
          {opportunity.closed ? "Closed" : opportunity.deadlineAt ? `Apply by ${new Date(opportunity.deadlineAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : "Open"}
        </span>
      </span>
    </Link>
  );
}
