import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { ProfileCard } from "@/lib/domain";

export function Author({ profile, meta }: { profile: ProfileCard | null; meta?: ReactNode }) {
  if (!profile) return <p className="text-sm text-ink-muted">[deleted account]</p>;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={`/@${profile.username}`} className="shrink-0" tabIndex={-1}>
        <Avatar person={profile} size="sm" />
      </Link>
      <div className="min-w-0">
        <Link href={`/@${profile.username}`} className="flex min-w-0 items-center gap-1 hover:underline">
          <span className="truncate text-[15px] font-semibold">{profile.displayName}</span>
          {profile.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified organisation" /> : null}
        </Link>
        <p className="truncate font-mono text-xs text-ink-muted">
          @{profile.username}
          {meta ? <> · {meta}</> : null}
        </p>
      </div>
    </div>
  );
}
