import Link from "next/link";
import { Wordmark } from "@/components/shell/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Wordmark />
      <main className="mt-8 w-full max-w-sm rounded-xl border border-hairline bg-surface p-6 sm:p-8">{children}</main>
      <p className="mt-6 text-center text-sm text-ink-muted">
        By joining you agree to the <Link href="/rules" className="text-primary hover:underline">community rules</Link>,{" "}
        <Link href="/terms" className="text-primary hover:underline">terms</Link> and{" "}
        <Link href="/privacy" className="text-primary hover:underline">privacy policy</Link>.
      </p>
    </div>
  );
}
