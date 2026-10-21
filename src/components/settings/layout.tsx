import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

export function SettingsGroup({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-hairline px-4 py-6 sm:px-6">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

// Stays in view on long forms; above the mobile tab bar on small screens.
export function SaveBar({ pending, error, label = "Save changes" }: { pending: boolean; error: string | null; label?: string }) {
  return (
    <div className="sticky bottom-(--mobile-nav-height) z-10 flex items-center justify-end gap-3 border-t border-hairline bg-surface/95 px-4 py-3 backdrop-blur sm:px-6 md:bottom-0">
      <div className="min-w-0 flex-1">
        <FormError message={error} />
      </div>
      <Button type="submit" disabled={pending} className="min-w-32">
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}
