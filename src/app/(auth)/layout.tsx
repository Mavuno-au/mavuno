import type { Metadata } from "next";
import { Wordmark } from "@/components/shell/brand";

// Sign-in, sign-up and password pages are for members, not search results.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Wordmark />
      <main className="mt-8 w-full max-w-sm rounded-xl border border-hairline bg-surface p-6 sm:p-8">{children}</main>
    </div>
  );
}
