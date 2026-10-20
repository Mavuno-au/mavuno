"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { requestPasswordReset, sendMagicLink, signIn, signUp, updatePassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { toUsername } from "@/lib/schemas";

export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [passwordState, passwordAction, signingIn] = useActionState(signIn, null);
  const [linkState, linkAction, sending] = useActionState(sendMagicLink, null);

  const state = mode === "password" ? passwordState : linkState;

  if (mode === "link" && linkState?.ok) {
    return (
      <p className="text-[15px]">
        Check your inbox. We sent you a link that signs you in. <button className="text-primary hover:underline" onClick={() => setMode("password")}>Use a password instead</button>
      </p>
    );
  }

  return (
    <form action={mode === "password" ? passwordAction : linkAction} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      {mode === "password" ? (
        <Field label="Password" htmlFor="password" hint={<Link href="/forgot-password" className="text-primary hover:underline">Forgot your password?</Link>}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      ) : null}
      <FormError message={state?.ok === false ? state.error : null} />
      <Button type="submit" size="lg" disabled={signingIn || sending} className="min-w-full">
        {mode === "password" ? (signingIn ? "Signing in…" : "Sign in") : sending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setMode(mode === "password" ? "link" : "password")}>
        {mode === "password" ? "Email me a sign-in link instead" : "Sign in with a password instead"}
      </button>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, null);
  // Controlled, so an error from the server (a taken username) doesn't clear the form.
  const [form, setForm] = useState({ displayName: "", username: "", email: "", password: "" });
  // Until someone edits the username, it follows their name.
  const [usernameEdited, setUsernameEdited] = useState(false);
  const username = usernameEdited ? form.username : toUsername(form.displayName.trim());
  const usernameHint =
    username.length === 0
      ? "Letters, numbers and underscores. Your profile will be at mavuno.au/@username."
      : username.length < 3
        ? "Use at least 3 letters or numbers."
        : `Your profile will be at mavuno.au/@${username}.`;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Your name" htmlFor="displayName">
        <Input
          id="displayName"
          name="displayName"
          autoComplete="name"
          maxLength={60}
          required
          autoFocus
          value={form.displayName}
          onChange={(event) => setForm({ ...form, displayName: event.target.value })}
        />
      </Field>
      <Field label="Username" htmlFor="username" hint={usernameHint}>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={30}
          required
          className="font-mono"
          value={username}
          onChange={(event) => {
            setUsernameEdited(true);
            setForm({ ...form, username: toUsername(event.target.value) });
          }}
        />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
      </Field>
      <FormError message={state?.ok === false ? state.error : null} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating your account…" : "Join Mavuno"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  if (state?.ok) return <p className="text-[15px]">If that email has an account, a reset link is on its way.</p>;
  return (
    <form action={action} className="grid gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <FormError message={state?.ok === false ? state.error : null} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <form action={action} className="grid gap-4">
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus />
      </Field>
      <FormError message={state?.ok === false ? state.error : null} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
