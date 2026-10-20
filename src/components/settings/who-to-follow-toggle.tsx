"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Checkbox } from "@/components/ui/field";
import { rememberHidden } from "@/lib/who-to-follow";

export function WhoToFollowToggle({ shown: initial }: { shown: boolean }) {
  const router = useRouter();
  const [shown, setShown] = useState(initial);
  return (
    <Checkbox
      label="Show Who to follow"
      hint="Suggestions of people to follow, in the side column and the feed."
      checked={shown}
      onChange={(event) => {
        setShown(event.target.checked);
        rememberHidden(!event.target.checked);
        router.refresh();
      }}
    />
  );
}
