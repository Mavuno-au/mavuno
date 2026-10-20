"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareProfileButton({ username }: { username: string }) {
  async function share() {
    const url = `${window.location.origin}/@${username}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `@${username} on Mavuno`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Profile link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <Button variant="outline" size="icon" aria-label={`Share @${username}'s profile`} title="Share profile" onClick={() => void share()}>
      <Share2 />
    </Button>
  );
}
