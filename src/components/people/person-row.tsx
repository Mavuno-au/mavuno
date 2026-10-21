import { BadgeCheck, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FollowButton } from "@/components/people/follow-button";
import { ProfileHoverCard } from "@/components/people/profile-card";
import { Avatar } from "@/components/ui/avatar";
import type { PersonSummary } from "@/lib/domain";

// With `card`, resting on the name or avatar opens a profile card. With
// `onDismiss`, the row offers "Not for me". Compact rows always take three
// lines, so a list keeps its shape when a person is swapped for another.
export function PersonRow({
  person,
  detail,
  compact = false,
  card = false,
  onDismiss,
}: {
  person: PersonSummary;
  detail?: string | null;
  compact?: boolean;
  card?: boolean;
  onDismiss?: () => void;
}) {
  const line = detail ?? person.headline ?? person.bio.split("\n")[0];
  const withCard = (node: ReactNode, className?: string) => (card ? <ProfileHoverCard username={person.username} className={className}>{node}</ProfileHoverCard> : node);
  return (
    <div className={compact ? "flex items-center gap-3 py-2" : "flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6"}>
      {withCard(
        <Link href={`/@${person.username}`} className="block shrink-0">
          <Avatar person={person} size={compact ? "sm" : "md"} />
        </Link>,
        "shrink-0",
      )}
      <div className="min-w-0 flex-1">
        {withCard(
          <Link href={`/@${person.username}`} className="flex min-w-0 items-center gap-1 hover:underline">
            <span className="truncate text-[15px] font-semibold">{person.displayName}</span>
            {person.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified organisation" /> : null}
          </Link>,
          "block min-w-0",
        )}
        <p className="truncate font-mono text-xs text-ink-muted">@{person.username}</p>
        {line || compact ? <p className="min-h-5 truncate text-sm text-ink-muted">{line}</p> : null}
      </div>
      <FollowButton profileId={person.id} following={person.following} followsYou={person.followsYou} />
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Not for me: @${person.username}`}
          title="Not for me"
          className="-mr-1.5 rounded-md p-1.5 text-ink-muted hover:bg-wash hover:text-ink"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
