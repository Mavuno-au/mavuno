"use client";

import Link from "next/link";
import { useState } from "react";
import { acceptRules } from "@/app/actions/moderation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/field";

// One line per rule, in the order of /rules, which has the detail.
const RULES = [
  { title: "Respect people", line: "Argue about ideas as hard as you like. No harassment, threats, or hate for who someone is.", href: "/rules#respect" },
  { title: "Keep people safe", line: "No private details, intimate images, sexual content, or anything that encourages harm.", href: "/rules#safety" },
  { title: "Be honest", line: "No scams, fake accounts or impersonation. Visa help only from registered agents.", href: "/rules#honesty" },
  { title: "Fair jobs and opportunities", line: "Jobs pay at least the legal minimum and never ask applicants for money.", href: "/rules#opportunities" },
  { title: "Use the right place", line: "Jobs under Opportunities, gatherings under Events, and space posts on the space's topic.", href: "/rules#right-place" },
];

// Shown once, before a member's first post, event or opportunity. The
// database refuses those until accept_rules has been called.
export function RulesDialog({ open, onAccepted, onClose }: { open: boolean; onAccepted: () => void; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    const result = await acceptRules();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAccepted();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Before your first post"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Not now
          </Button>
          <Button onClick={accept} disabled={pending}>
            {pending ? "Saving…" : "I've read them and I agree"}
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-ink-muted">
        Mavuno works because people can trust what they read here. These are the five community rules. Breaking them can mean a removed post, a suspension or a ban.
      </p>
      <ol className="mt-4 grid gap-3 text-[15px]">
        {RULES.map((rule, index) => (
          <li key={rule.href} className="flex gap-3">
            <span className="w-5 shrink-0 font-mono text-sm text-ink-muted">{index + 1}.</span>
            <span>
              <Link href={rule.href} className="font-semibold hover:underline">
                {rule.title}
              </Link>
              <span className="block text-ink-muted">{rule.line}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-ink-muted">
        Read the{" "}
        <Link href="/rules" className="text-primary hover:underline">
          whole community rules
        </Link>{" "}
        any time. Reports from members are how moderation starts, so please use them.
      </p>
      <FormError message={error} />
    </Dialog>
  );
}
