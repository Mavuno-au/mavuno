import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-[15px] text-ink-muted">We'll email you a link to choose a new one.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-center text-sm text-ink-muted hover:text-ink">Back to sign in</Link>
    </div>
  );
}
