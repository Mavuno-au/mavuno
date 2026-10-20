"use client";

import { useActionState, useEffect, useState } from "react";
import { changeEmail, changePassword, checkUsername, deleteAccount, updateProfile } from "@/app/actions/settings";
import { SettingsGroup } from "@/components/settings/layout";
import { useSave } from "@/components/settings/use-save";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/field";
import { useViewer } from "@/components/shell/viewer-context";
import { cn } from "@/lib/cn";

type Availability = { kind: "idle" } | { kind: "checking" } | { kind: "available" } | { kind: "taken" } | { kind: "invalid"; message: string };

const AVAILABILITY_TEXT = {
  idle: "Your profile is at mavuno.au/@username. Old links stop working when you change it.",
  checking: "Checking…",
  available: "Available",
  taken: "That username is taken.",
} as const;

function useAvailability(username: string, current: string): Availability {
  const [result, setResult] = useState<{ for: string; availability: Availability }>({ for: current, availability: { kind: "idle" } });
  const normalised = username.trim().toLowerCase();

  useEffect(() => {
    if (normalised === current) return;
    const timer = setTimeout(async () => {
      const checked = await checkUsername(normalised);
      setResult({
        for: normalised,
        availability: !checked.ok ? { kind: "invalid", message: checked.error } : checked.data.available ? { kind: "available" } : { kind: "taken" },
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [normalised, current]);

  if (normalised === current) return { kind: "idle" };
  return result.for === normalised ? result.availability : { kind: "checking" };
}

export function UsernameForm() {
  const viewer = useViewer();
  const current = viewer?.username ?? "";
  const [username, setUsername] = useState(current);
  const availability = useAvailability(username, current);
  const { pending, error, save } = useSave();

  const hint = availability.kind === "invalid" ? availability.message : AVAILABILITY_TEXT[availability.kind];
  const tone = availability.kind === "available" ? "text-primary" : availability.kind === "taken" || availability.kind === "invalid" ? "text-destructive" : "text-ink-muted";

  return (
    <SettingsGroup title="Username">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (viewer) save(() => updateProfile(viewer.id, { username }), "Username changed");
        }}
      >
        <div className="grid gap-1.5">
          <label htmlFor="username" className="sr-only">
            Username
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-ink-muted">@</span>
              <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={30} autoComplete="username" className="pl-7 font-mono" aria-describedby="username-hint" />
            </div>
            <Button type="submit" disabled={pending || availability.kind !== "available"} className="min-w-24">
              {pending ? "Saving…" : "Change"}
            </Button>
          </div>
          <p id="username-hint" aria-live="polite" className={cn("min-h-5 text-sm", tone)}>
            {hint}
          </p>
        </div>
        <FormError message={error} />
      </form>
    </SettingsGroup>
  );
}

export function EmailForm() {
  const [state, action, pending] = useActionState(changeEmail, null);
  return (
    <SettingsGroup title="Email" hint="Your email is never shown to anyone. We send a confirmation link to the new address, and the change happens once you open it.">
      {state?.ok ? (
        <p className="text-[15px]">Check your inbox for a confirmation link. Your email stays the same until you open it.</p>
      ) : (
        <form action={action} className="grid gap-3">
          <Field label="New email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <FormError message={state?.ok === false ? state.error : null} />
          <div>
            <Button type="submit" disabled={pending} className="min-w-36">
              {pending ? "Sending…" : "Change email"}
            </Button>
          </div>
        </form>
      )}
    </SettingsGroup>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <SettingsGroup title="Password" hint="Signed up with Google or an email link? Set a password here to sign in with one too.">
      <form action={action} className="grid gap-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
          </Field>
          <Field label="Type it again" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required />
          </Field>
        </div>
        <p role="status" aria-live="polite" className={cn("min-h-5 text-sm", state?.ok ? "text-primary" : "text-destructive")}>
          {state ? (state.ok ? "Password changed." : state.error) : null}
        </p>
        <div>
          <Button type="submit" disabled={pending} className="min-w-40">
            {pending ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </SettingsGroup>
  );
}

export function DataExport() {
  return (
    <SettingsGroup
      title="Download your data"
      hint="A JSON file with your profile, settings, posts, likes, saved posts, follows, mutes, blocks, spaces, events, opportunities, messages you sent and notifications. Images are included as links. Keep it private. You can download it 3 times an hour."
    >
      <div>
        {/* A plain link: the route answers with a file download. */}
        <a href="/api/export" className={buttonClass({ variant: "outline" })}>
          Download my data
        </a>
      </div>
    </SettingsGroup>
  );
}

export function DeleteAccount() {
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(deleteAccount, null);
  const username = viewer?.username ?? "";

  return (
    <SettingsGroup title="Delete your account" hint="This can't be undone. Download your data first if you want a copy.">
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <form action={action} className="grid gap-4">
          <div className="grid gap-2 text-[15px]">
            <p>Your profile, posts, replies, likes, follows, messages you sent and the images you uploaded are deleted for good. Replies other people wrote under your posts stay, under a [deleted] placeholder.</p>
            <p>Organisations you own on your own are deleted too. Hand them over first if they should carry on.</p>
          </div>
          <Field label={`Type ${username} to confirm`} htmlFor="confirm-delete">
            <Input id="confirm-delete" name="confirm" autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" value={typed} onChange={(event) => setTyped(event.target.value)} />
          </Field>
          <FormError message={state?.ok === false ? state.error : null} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || typed.trim().toLowerCase() !== username} className="min-w-40">
              {pending ? "Deleting…" : "Delete my account"}
            </Button>
          </div>
        </form>
      </Dialog>
    </SettingsGroup>
  );
}
