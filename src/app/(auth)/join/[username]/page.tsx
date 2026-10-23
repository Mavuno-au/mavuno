import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { answeredUnder16, readBirthDate } from "@/lib/age-check";
import { loadInviter } from "@/lib/data/profiles";
import { onboardingPath, signInPath } from "@/lib/safe-redirect";
import { getViewer } from "@/lib/viewer";
import { SignUpForm } from "../../auth-forms";
import { Agreement } from "../../agreement";
import { GoogleButton } from "../../google-button";
import { SignUpSteps, type SignUpStart } from "../../signup/sign-up-steps";
import { INTRO, TAGLINE } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/join/[username]">): Promise<Metadata> {
  const inviter = await loadInviter((await params).username);
  if (!inviter) return { title: "Join" };
  return {
    title: { absolute: `${inviter.displayName} invited you to Mavuno` },
    description: `Join ${inviter.displayName} on Mavuno, ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1)}. ${INTRO}`,
    // The share image is drawn by ./opengraph-image.tsx.
    openGraph: { url: `/join/${inviter.username}` },
  };
}

// A member's invite link. Whoever joins through it and the member follow
// each other, and the member is told so they can say welcome.
export default async function JoinPage({ params }: PageProps<"/join/[username]">) {
  const inviter = await loadInviter((await params).username);
  // A changed username or a suspended account still leaves a way to join.
  if (!inviter) redirect("/signup");
  if (await getViewer()) redirect(`/@${inviter.username}`);
  const start: SignUpStart = (await answeredUnder16()) ? "under_16" : (await readBirthDate()) ? "methods" : "age";
  return (
    <div className="grid gap-5">
      <div className="grid justify-items-start gap-3">
        <Avatar person={inviter} size="lg" ring />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{inviter.displayName} invited you to Mavuno</h1>
          <p className="mt-1 text-[15px] text-ink-muted">Join free, and once you're in you'll follow each other. Find your city's space, events and work, and people with shared roots.</p>
        </div>
      </div>
      <SignUpSteps start={start}>
        <GoogleButton next={onboardingPath("/")} invite={inviter.username} />
        <SignUpForm next="/" invite={inviter.username} />
      </SignUpSteps>
      <p className="text-center text-sm text-ink-muted">
        Already a member? <Link href={signInPath(`/@${inviter.username}`)} className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
      <Agreement joining />
    </div>
  );
}
