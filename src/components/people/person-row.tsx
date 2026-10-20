import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { FollowButton } from "@/components/people/follow-button";
import { Avatar } from "@/components/ui/avatar";
import type { PersonSummary } from "@/lib/domain";

export function PersonRow({ person, detail, compact = false }: { person: PersonSummary; detail?: string | null; compact?: boolean }) {
  const line = detail ?? person.headline ?? person.bio.split("\n")[0];
  return (
    <div className={compact ? "flex items-center gap-3 py-2" : "flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6"}>
      <Link href={`/@${person.username}`} className="shrink-0">
        <Avatar person={person} size={compact ? "sm" : "md"} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/@${person.username}`} className="flex min-w-0 items-center gap-1 hover:underline">
          <span className="truncate text-[15px] font-semibold">{person.displayName}</span>
          {person.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified organisation" /> : null}
        </Link>
        <p className="truncate font-mono text-xs text-ink-muted">@{person.username}</p>
        {line ? <p className="truncate text-sm text-ink-muted">{line}</p> : null}
      </div>
      <FollowButton profileId={person.id} following={person.following} followsYou={person.followsYou} />
    </div>
  );
}
