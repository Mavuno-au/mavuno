import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/shell/brand";
import { ButtonLink } from "@/components/ui/button";
import { getViewer } from "@/lib/viewer";
import { ForgetBrowserData } from "./forget-browser-data";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

// Where deleting an account lands. A signed-in member reaching it by address
// still has an account, so telling them it's gone would be false.
export default async function DeletedPage() {
  if (await getViewer()) redirect("/");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <ForgetBrowserData />
      <Wordmark />
      <div className="grid max-w-sm gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your account is deleted</h1>
        <p className="text-[15px] text-ink-muted">Your profile, posts and the messages you sent are gone, and you're signed out. Thank you for being part of Mavuno.</p>
      </div>
      <ButtonLink href="/">Go home</ButtonLink>
    </main>
  );
}
