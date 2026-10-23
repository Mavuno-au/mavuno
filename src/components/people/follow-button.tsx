"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRelation } from "@/app/actions/social";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/components/shell/viewer-context";
import { cn } from "@/lib/cn";
import { joinPath } from "@/lib/safe-redirect";
import { reach } from "@/lib/version";

// After following, the button keeps saying "Following" until the pointer
// leaves, so a second click never unfollows by accident.
export function FollowButton({ profileId, following: initial, followsYou = false, size = "sm" }: { profileId: string; following: boolean; followsYou?: boolean; size?: "sm" | "md" }) {
  const viewer = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = useState(initial);
  const [armed, setArmed] = useState(true);
  const [pending, startTransition] = useTransition();

  if (viewer?.id === profileId) return null;

  function toggle() {
    if (!viewer) return router.push(joinPath(pathname));
    const next = !following;
    setFollowing(next);
    setArmed(false);
    startTransition(async () => {
      const result = await reach(setRelation("follow", profileId, next));
      if (!result.ok) {
        setFollowing(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      size={size}
      variant={following ? "outline" : "primary"}
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
      onMouseLeave={() => setArmed(true)}
      className={cn("group/follow min-w-24", following && armed && "hover:border-destructive hover:text-destructive")}
    >
      {following ? (
        <>
          <span className={cn(armed && "group-hover/follow:hidden")}>Following</span>
          <span className={cn("hidden", armed && "group-hover/follow:inline")}>Unfollow</span>
        </>
      ) : followsYou ? (
        "Follow back"
      ) : (
        "Follow"
      )}
    </Button>
  );
}
