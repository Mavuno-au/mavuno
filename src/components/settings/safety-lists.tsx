"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRelation } from "@/app/actions/social";
import { SettingsGroup } from "@/components/settings/layout";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { ProfileCard } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { reach } from "@/lib/version";

type Entry = { since: string; profile: ProfileCard };

const LISTS = {
  mute: {
    title: "Muted",
    hint: "Their posts and replies are left out of your feeds, threads, search and suggestions, and you don't get notifications from them. Muting is silent: they aren't told, and follows stay as they are.",
    empty: "You haven't muted anyone.",
    undo: "Unmute",
    done: "Unmuted",
  },
  block: {
    title: "Blocked",
    hint: "You can't follow, message or reply to each other, and you won't see each other's posts while signed in. Blocking removes follows both ways, and unblocking doesn't bring them back.",
    empty: "You haven't blocked anyone.",
    undo: "Unblock",
    done: "Unblocked",
  },
} as const;

function RelationList({ relation, entries }: { relation: keyof typeof LISTS; entries: Entry[] }) {
  const copy = LISTS[relation];
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const visible = entries.filter((entry) => !removed.has(entry.profile.id));

  function undo(profile: ProfileCard) {
    startTransition(async () => {
      const result = await reach(setRelation(relation, profile.id, false));
      if (!result.ok) return void toast.error(result.error);
      setRemoved((current) => new Set(current).add(profile.id));
      toast.success(`${copy.done} @${profile.username}`);
    });
  }

  return (
    <SettingsGroup title={copy.title} hint={copy.hint}>
      {visible.length === 0 ? (
        <p className="text-sm text-ink-muted">{copy.empty}</p>
      ) : (
        <ul className="-mx-4 divide-y divide-hairline border-y border-hairline sm:-mx-6">
          {visible.map(({ since, profile }) => (
            <li key={profile.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <Link href={`/@${profile.username}`} className="shrink-0">
                <Avatar person={profile} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/@${profile.username}`} className="block truncate text-[15px] font-semibold hover:underline">
                  {profile.displayName}
                </Link>
                <p className="truncate font-mono text-xs text-ink-muted">
                  @{profile.username} · {relativeTime(since)}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => undo(profile)} className="min-w-24">
                {copy.undo}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsGroup>
  );
}

export function SafetyLists({ muted, blocked }: { muted: Entry[]; blocked: Entry[] }) {
  return (
    <>
      <RelationList relation="mute" entries={muted} />
      <RelationList relation="block" entries={blocked} />
    </>
  );
}
