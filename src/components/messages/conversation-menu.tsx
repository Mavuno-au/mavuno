"use client";

import { Archive, ArchiveRestore, Ban, Bell, BellOff, Flag, LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeMember, setArchived, setMuted } from "@/app/actions/messages";
import { setRelation } from "@/app/actions/social";
import { GroupSettingsDialog } from "@/components/messages/group-settings-dialog";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Menu, type MenuItem } from "@/components/ui/menu";
import type { Conversation } from "@/lib/data/messages";
import type { Result } from "@/lib/result";

type Confirmation = { title: string; body: string; label: string; done: string; run: () => Promise<Result> };

export function ConversationMenu({ conversation, viewerId }: { conversation: Conversation; viewerId: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const [pending, startTransition] = useTransition();
  const { other } = conversation;

  function run(action: () => Promise<Result>, success: string, leave: boolean) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast(success);
        setConfirming(null);
        if (leave) router.push("/messages");
      } catch {
        toast.error("Couldn't reach Mavuno. Check your connection and try again.");
      }
    });
  }

  const items: MenuItem[] = [
    ...(other ? [{ kind: "link" as const, label: "View profile", icon: <User />, href: `/@${other.username}` }] : []),
    ...(conversation.kind === "group" ? [{ kind: "action" as const, label: "Group settings", icon: <Settings />, onSelect: () => setSettings(true) }] : []),
    conversation.muted
      ? { kind: "action", label: "Unmute", icon: <Bell />, onSelect: () => run(() => setMuted(conversation.id, false), "Unmuted", false) }
      : { kind: "action", label: "Mute", icon: <BellOff />, onSelect: () => run(() => setMuted(conversation.id, true), "Muted. New messages won't add to your count.", false) },
    conversation.archived
      ? { kind: "action", label: "Move to inbox", icon: <ArchiveRestore />, onSelect: () => run(() => setArchived(conversation.id, false), "Moved to your inbox", false) }
      : { kind: "action", label: "Archive", icon: <Archive />, onSelect: () => run(() => setArchived(conversation.id, true), "Archived. It comes back when someone sends a new message.", true) },
    ...(other
      ? [
          { kind: "action" as const, label: `Report ${other.displayName}`, icon: <Flag />, onSelect: () => setReporting(true) },
          {
            kind: "action" as const,
            label: `Block ${other.displayName}`,
            icon: <Ban />,
            danger: true,
            onSelect: () =>
              setConfirming({
                title: `Block ${other.displayName}?`,
                body: "They won't be able to message or follow you, and you won't see each other's posts. They won't be told.",
                label: "Block",
                done: `Blocked ${other.displayName}`,
                run: () => setRelation("block", other.id, true),
              }),
          },
        ]
      : []),
    ...(conversation.kind === "group"
      ? [
          {
            kind: "action" as const,
            label: "Leave group",
            icon: <LogOut />,
            danger: true,
            onSelect: () =>
              setConfirming({
                title: "Leave this group?",
                body: "You'll stop getting its messages. Someone in the group will need to add you again to rejoin.",
                label: "Leave",
                done: "You left the group",
                run: () => removeMember(conversation.id, viewerId),
              }),
          },
        ]
      : []),
  ];

  return (
    <>
      <Menu label="Conversation options" items={items} />
      {conversation.kind === "group" ? <GroupSettingsDialog open={settings} onClose={() => setSettings(false)} conversation={conversation} /> : null}
      <ReportDialog target={reporting && other ? { targetType: "profile", targetId: other.id } : null} onClose={() => setReporting(false)} what="account" />
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming?.title ?? ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} className="min-w-20" onClick={() => confirming && run(confirming.run, confirming.done, true)}>
              {confirming?.label}
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-ink-muted">{confirming?.body}</p>
      </Dialog>
    </>
  );
}
