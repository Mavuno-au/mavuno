import { Wordmark } from "@/components/shell/brand";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Wordmark />
      <div className="grid max-w-sm gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">We couldn't find that</h1>
        <p className="text-[15px] text-ink-muted">The page may have moved, or the post or profile was deleted.</p>
      </div>
      <ButtonLink href="/">Go home</ButtonLink>
    </main>
  );
}
