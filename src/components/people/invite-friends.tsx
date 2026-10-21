"use client";

import { MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { publicEnv } from "@/lib/env";
import { INVITE_TEXT, inviteMessage, inviteUrl, whatsAppLink } from "@/lib/invites";

// Shares the invite like ShareProfileButton shares a profile: the share sheet
// where there is one, otherwise the message is copied. `compact` keeps only
// the icon on phones, where a profile's buttons share a row with the avatar.
export function InviteFriendsButton({ username, compact = false, className }: { username: string; compact?: boolean; className?: string }) {
  async function share() {
    const url = inviteUrl(window.location.origin, username);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Join me on Mavuno", text: INVITE_TEXT, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(inviteMessage(url));
      toast("Invite copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  return (
    <Button variant="outline" size="sm" className={cn(compact && "max-sm:size-9 max-sm:px-0", className)} onClick={() => void share()}>
      <UserPlus />
      <span className={cn(compact && "max-sm:sr-only")}>Invite friends</span>
    </Button>
  );
}

// Most of the community talks in WhatsApp groups, so the message is ready to send there.
export function WhatsAppInviteLink({ username, className }: { username: string; className?: string }) {
  return (
    <a href={whatsAppLink(inviteUrl(publicEnv.siteUrl, username))} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "outline", size: "sm" }, className)}>
      <MessageCircle />
      Send on WhatsApp
    </a>
  );
}

export function InviteFriends({ username, className }: { username: string; className?: string }) {
  return (
    <section className={cn("text-sm", className)}>
      <h2 className="font-semibold">Bring your friends</h2>
      <p className="mt-1 text-ink-muted">Mavuno is better with people you know. When a friend joins with your link, you'll follow each other.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <InviteFriendsButton username={username} />
        <WhatsAppInviteLink username={username} />
      </div>
    </section>
  );
}
