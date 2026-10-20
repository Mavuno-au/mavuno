import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { joinPath, safeNext } from "@/lib/safe-redirect";
import { SignInForm } from "../auth-forms";
import { GoogleButton } from "../google-button";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Sign in again.",
  google: "Google sign-in didn't work. Try again or use your email.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getViewer()) redirect(next);
  const error = typeof params.error === "string" ? NOTICES[params.error] : undefined;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-[15px] text-ink-muted">Sign in to post, follow and message.</p>
      </div>
      {params.sent === "confirm" ? (
        <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary">Check your email to confirm your account, then sign in.</p>
      ) : null}
      {error ? <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p> : null}
      <GoogleButton next={next} />
      <SignInForm next={next} />
      <p className="text-center text-sm text-ink-muted">
        New here? <Link href={joinPath(next)} className="font-medium text-primary hover:underline">Create an account</Link>
      </p>
    </div>
  );
}
