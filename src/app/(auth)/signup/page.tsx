import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { answeredUnder16, readBirthDate } from "@/lib/age-check";
import { onboardingPath, safeNext, signInPath } from "@/lib/safe-redirect";
import { getViewer } from "@/lib/viewer";
import { SignUpForm } from "../auth-forms";
import { Agreement } from "../agreement";
import { GoogleButton } from "../google-button";
import { SignUpSteps, type SignUpStart } from "./sign-up-steps";

export const metadata: Metadata = { title: "Join" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const next = safeNext((await searchParams).next);
  if (await getViewer()) redirect(next);
  const start: SignUpStart = (await answeredUnder16()) ? "under_16" : (await readBirthDate()) ? "methods" : "age";
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Join Mavuno</h1>
        <p className="mt-1 text-[15px] text-ink-muted">Free, and takes a minute. Follow people, join your city's space and reply to posts.</p>
      </div>
      <SignUpSteps start={start}>
        <GoogleButton next={onboardingPath(next)} />
        <SignUpForm next={next} />
      </SignUpSteps>
      <p className="text-center text-sm text-ink-muted">
        Already a member? <Link href={signInPath(next)} className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
      <Agreement joining />
    </div>
  );
}
