import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { ResetPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  await requireViewer("/reset-password");
  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <ResetPasswordForm />
    </div>
  );
}
