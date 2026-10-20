"use client";

import { ShieldCheck, ShieldOff, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addMembers, removeMember, renameGroup, setRole } from "@/app/actions/messages";
import { PeoplePicker } from "@/components/messages/people-picker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Chip } from "@/components/ui/page";
import { useViewer } from "@/components/shell/viewer-context";
import type { Conversation, GroupRole, Member } from "@/lib/data/messages";
import type { PersonSummary } from "@/lib/domain";
import type { Result } from "@/lib/result";

const ROLE_LABELS: Record<GroupRole, string | null> = { owner: "Owner", admin: "Admin", member: null };

export function GroupSettingsDialog({ open, onClose, conversation }: { open: boolean; onClose: () => void; conversation: Conversation }) {
  const viewer = useViewer();
  const [title, setTitle] = useState(conversation.title ?? "");
  const [adding, setAdding] = useState<PersonSummary[]>([]);
  const [pending, startTransition] = useTransition();
  const isAdmin = conversation.myRole !== "member";
  const isOwner = conversation.myRole === "owner";

  function run(action: () => Promise<Result>, success: string, after?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast(success);
        after?.();
      } catch {
        toast.error("Couldn't reach Mavuno. Check your connection and try again.");
      }
    });
  }

  function memberItems(member: Member): MenuItem[] {
    if (member.role === "owner" || !isAdmin) return [];
    const role: MenuItem[] = isOwner
      ? [
          member.role === "admin"
            ? { kind: "action", label: "Remove admin", icon: <ShieldOff />, onSelect: () => run(() => setRole(conversation.id, member.id, "member"), `${member.displayName} is no longer an admin`) }
            : { kind: "action", label: "Make admin", icon: <ShieldCheck />, onSelect: () => run(() => setRole(conversation.id, member.id, "admin"), `${member.displayName} is now an admin`) },
        ]
      : [];
    return [...role, { kind: "action", label: "Remove from group", icon: <UserMinus />, danger: true, onSelect: () => run(() => removeMember(conversation.id, member.id), `Removed ${member.displayName}`) }];
  }

  return (
    <Dialog open={open} onClose={onClose} title="Group settings">
      <div className="grid gap-6">
        {isAdmin ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => renameGroup(conversation.id, title), title.trim() ? "Group renamed" : "Group name removed");
            }}
          >
            <div className="min-w-0 flex-1">
              <Field label="Group name" htmlFor="group-name">
                <Input id="group-name" value={title} maxLength={60} placeholder={conversation.name} onChange={(event) => setTitle(event.target.value)} />
              </Field>
            </div>
            <Button type="submit" variant="outline" disabled={pending || title.trim() === (conversation.title ?? "")} className="h-10 min-w-20">
              Save
            </Button>
          </form>
        ) : null}

        <section>
          <h3 className="mb-1 text-sm font-medium">
            People <span className="font-mono text-xs text-ink-muted">{conversation.members.length + 1}</span>
          </h3>
          <ul className="divide-y divide-hairline">
            {viewer ? (
              <li className="flex items-center gap-3 py-2">
                <Avatar person={viewer} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">You</span>
                {ROLE_LABELS[conversation.myRole] ? <Chip>{ROLE_LABELS[conversation.myRole]}</Chip> : null}
              </li>
            ) : null}
            {conversation.members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-2">
                <Avatar person={member} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{member.displayName}</span>
                  <span className="block truncate font-mono text-xs text-ink-muted">@{member.username}</span>
                </span>
                {member.status === "pending" ? <Chip>Invited</Chip> : null}
                {ROLE_LABELS[member.role] ? <Chip tone="primary">{ROLE_LABELS[member.role]}</Chip> : null}
                <Menu label={`Options for ${member.displayName}`} items={memberItems(member)} />
              </li>
            ))}
          </ul>
        </section>

        {isAdmin ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Add people</h3>
            <PeoplePicker selected={adding} onChange={setAdding} exclude={conversation.members.map((member) => member.id)} />
            {adding.length > 0 ? (
              <Button
                className="min-w-24 justify-self-end"
                disabled={pending}
                onClick={() => run(() => addMembers(conversation.id, adding.map((person) => person.id)), adding.length === 1 ? `Added ${adding[0]?.displayName}` : `Added ${adding.length} people`, () => setAdding([]))}
              >
                {adding.length === 1 ? "Add" : `Add ${adding.length}`}
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
