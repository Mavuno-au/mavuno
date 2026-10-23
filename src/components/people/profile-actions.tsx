"use client";

import { Flag, MessageCircle, UserX, VolumeX, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { startConversation } from "@/app/actions/messages";
import { setRelation } from "@/app/actions/social";
import { ConfirmBlockDialog } from "@/components/people/confirm-block-dialog";
import { FollowButton } from "@/components/people/follow-button";
import { InviteFriendsButton } from "@/components/people/invite-friends";
import { ShareProfileButton } from "@/components/people/share-profile-button";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { useViewer } from "@/components/shell/viewer-context";
import type { Relationship } from "@/lib/data/profiles";
import { reach } from "@/lib/version";

export function ProfileActions({ profile }: { profile: { id: string; username: string; displayName: string; relationship: Relationship; canManage: boolean } }) {
  const viewer = useViewer();
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [pending, startTransition] = useTransition();
  const { relationship } = profile;

  if (relationship.self || profile.canManage) {
    return (
      <div className="flex items-center gap-2">
        <ShareProfileButton username={profile.username} />
        {relationship.self ? <InviteFriendsButton username={profile.username} compact /> : null}
        <ButtonLink href={relationship.self ? "/settings" : `/settings/organisations/${profile.username}`} variant="outline" size="sm">
          Edit profile
        </ButtonLink>
      </div>
    );
  }

  function mute(on: boolean) {
    startTransition(async () => {
      const result = await reach(setRelation("mute", profile.id, on));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast(on ? `Muted @${profile.username}. Their posts won't show in your feeds.` : `Unmuted @${profile.username}`);
      router.refresh();
    });
  }

  function message() {
    startTransition(async () => {
      const result = await reach(startConversation(profile.id));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/messages/${result.data.id}`);
    });
  }

  const items: MenuItem[] = viewer
    ? [
        relationship.muted
          ? { kind: "action", label: `Unmute @${profile.username}`, icon: <Volume2 />, onSelect: () => mute(false) }
          : { kind: "action", label: `Mute @${profile.username}`, icon: <VolumeX />, onSelect: () => mute(true) },
        { kind: "action", label: `Block @${profile.username}`, icon: <UserX />, danger: true, onSelect: () => setBlocking(true) },
        { kind: "action", label: "Report profile", icon: <Flag />, danger: true, onSelect: () => setReporting(true) },
      ]
    : [];

  return (
    <div className="flex items-center gap-2">
      <Menu items={items} label="Profile options" />
      <ShareProfileButton username={profile.username} />
      {relationship.canMessage ? (
        <Button variant="outline" size="icon" aria-label="Message" title="Message" disabled={pending} onClick={message}>
          <MessageCircle />
        </Button>
      ) : null}
      <FollowButton profileId={profile.id} following={relationship.following} followsYou={relationship.followsYou} size="md" />
      <ReportDialog target={reporting ? { targetType: "profile", targetId: profile.id } : null} onClose={() => setReporting(false)} what="profile" />
      <ConfirmBlockDialog profile={profile} open={blocking} onClose={() => setBlocking(false)} onBlocked={() => router.refresh()} />
    </div>
  );
}

export function UnblockButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reach(setRelation("block", profileId, false));
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
    >
      Unblock
    </Button>
  );
}
