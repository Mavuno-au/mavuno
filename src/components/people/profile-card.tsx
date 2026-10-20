"use client";

import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { FollowButton } from "@/components/people/follow-button";
import { Avatar, ColourDot } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/page";
import { parseProfilePreview, type ProfilePreview } from "@/lib/domain";
import { getBrowserClient } from "@/lib/supabase/browser";

const OPEN_DELAY = 450;
const CLOSE_DELAY = 200;
const WIDTH = 288;
const HEIGHT = 240;
const MARGIN = 8;

type Loaded = { kind: "profile"; profile: ProfilePreview } | { kind: "unavailable" };
type Position = { left: number; top: number } | { left: number; bottom: number };

// Shared by every card on the page, so moving between posts by the same person
// shows the card at once while it refreshes.
const cache = new Map<string, Loaded>();

async function fetchPreview(username: string): Promise<Loaded> {
  const { data, error } = await getBrowserClient().rpc("profile_preview", { p_username: username });
  if (error) throw new Error(error.message);
  const profile = parseProfilePreview(data);
  const loaded: Loaded = profile ? { kind: "profile", profile } : { kind: "unavailable" };
  cache.set(username, loaded);
  return loaded;
}

// Below the trigger, or above it when there is no room below.
function positionFor(trigger: Element): Position {
  const rect = trigger.getBoundingClientRect();
  const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - WIDTH - MARGIN);
  return rect.bottom + MARGIN + HEIGHT > window.innerHeight && rect.top > HEIGHT
    ? { left, bottom: window.innerHeight - rect.top + MARGIN }
    : { left, top: rect.bottom + MARGIN };
}

// A card about a person, opened by resting the mouse on their name or avatar,
// or by tabbing to it. Touch never opens it: a tap goes to the profile. The
// card sits right after the trigger in the page, so Tab reaches its buttons.
export function ProfileHoverCard({ username, children, className }: { username: string; children: ReactNode; className?: string }) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [position, setPosition] = useState<Position | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const close = () => {
    clearTimeout(timer.current);
    setPosition(null);
  };

  function scheduleOpen() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const trigger = wrapper.current?.firstElementChild;
      if (!trigger) return;
      setLoaded(cache.get(username) ?? null);
      setPosition(positionFor(trigger));
      fetchPreview(username).then(setLoaded, () => setLoaded((current) => current ?? { kind: "unavailable" }));
    }, OPEN_DELAY);
  }

  function scheduleClose() {
    clearTimeout(timer.current);
    timer.current = setTimeout(close, CLOSE_DELAY);
  }

  useEffect(() => {
    if (!position) return;
    const onEscape = (event: globalThis.KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onEscape);
    };
  }, [position]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onPointerEnter(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    if (position) clearTimeout(timer.current);
    else scheduleOpen();
  }

  function onPointerLeave(event: PointerEvent) {
    if (event.pointerType === "mouse") scheduleClose();
  }

  function onFocus(event: FocusEvent) {
    if (position) clearTimeout(timer.current);
    else if (event.target === wrapper.current?.firstElementChild && event.target.matches(":focus-visible")) scheduleOpen();
  }

  function onBlur(event: FocusEvent) {
    if (!(event.relatedTarget instanceof Node && wrapper.current?.contains(event.relatedTarget))) scheduleClose();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !position) return;
    event.stopPropagation();
    close();
    const trigger = wrapper.current?.firstElementChild;
    if (trigger instanceof HTMLElement) trigger.focus();
  }

  return (
    <span ref={wrapper} className={className} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown}>
      {children}
      {position && loaded?.kind !== "unavailable" ? (
        <span
          role="dialog"
          aria-label={`About @${username}`}
          style={{ ...position, width: WIDTH }}
          onClick={(event) => event.stopPropagation()}
          className="fixed z-50 block cursor-auto rounded-xl border border-hairline bg-popover p-4 text-left text-ink shadow-lg motion-safe:animate-fade-in"
        >
          {loaded ? <CardContent profile={loaded.profile} /> : <CardSkeleton />}
        </span>
      ) : null}
    </span>
  );
}

function CardContent({ profile }: { profile: ProfilePreview }) {
  const href = `/@${profile.username}`;
  return (
    <>
      <span className="flex items-start justify-between gap-3">
        <Link href={href} tabIndex={-1} className="shrink-0">
          <Avatar person={profile} size="lg" ring />
        </Link>
        <FollowButton key={`${profile.id}:${profile.viewerFollows}`} profileId={profile.id} following={profile.viewerFollows} followsYou={profile.followsYou} />
      </span>
      <Link href={href} className="mt-3 flex min-w-0 items-center gap-1 font-semibold hover:underline">
        <span className="truncate">{profile.displayName}</span>
        {profile.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified organisation" /> : null}
      </Link>
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-[13px] text-ink-muted">
        <ColourDot colour={profile.colour} />
        <span className="truncate">@{profile.username}</span>
        {profile.followsYou ? <Chip className="ml-1 shrink-0 font-sans">Follows you</Chip> : null}
        {profile.muted ? <Chip tone="warning" className="ml-1 shrink-0 font-sans">Muted</Chip> : null}
      </span>
      {profile.headline || profile.bio ? <span className="mt-2 line-clamp-3 block text-sm text-pretty">{profile.headline ?? profile.bio}</span> : null}
      <span className="mt-3 flex gap-4 text-sm">
        <span>
          <span className="font-mono font-medium tabular">{profile.posts}</span> <span className="text-ink-muted">{profile.posts === 1 ? "post" : "posts"}</span>
        </span>
        <Link href={`${href}/following`} className="hover:underline">
          <span className="font-mono font-medium tabular">{profile.following}</span> <span className="text-ink-muted">following</span>
        </Link>
        <Link href={`${href}/followers`} className="hover:underline">
          <span className="font-mono font-medium tabular">{profile.followers}</span> <span className="text-ink-muted">{profile.followers === 1 ? "follower" : "followers"}</span>
        </Link>
      </span>
    </>
  );
}

function CardSkeleton() {
  return (
    <span aria-hidden className="block">
      <span className="flex items-start justify-between gap-3">
        <span className="size-14 animate-pulse rounded-full bg-wash" />
        <span className="h-8 w-24 animate-pulse rounded-md bg-wash" />
      </span>
      <span className="mt-3 block h-4 w-32 animate-pulse rounded bg-wash" />
      <span className="mt-2 block h-3.5 w-24 animate-pulse rounded bg-wash" />
      <span className="mt-4 block h-3.5 w-48 animate-pulse rounded bg-wash" />
    </span>
  );
}
