import Link from "next/link";
import { BackLink } from "@/components/ui/back-link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, back, meta, actions, children }: { title: ReactNode; back?: string; meta?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="sticky top-14 z-20 border-b border-hairline bg-surface/95 backdrop-blur md:top-0">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        {back ? <BackLink fallback={back} /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{title}</h1>
          {meta ? <p className="truncate text-xs text-ink-muted">{meta}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </header>
  );
}

export type Tab = { href: string; label: string; active: boolean; badge?: number };

export function Tabs({ tabs, className }: { tabs: Tab[]; className?: string }) {
  return (
    <nav className={cn("flex overflow-x-auto [scrollbar-width:none]", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "relative flex min-w-fit flex-1 items-center justify-center gap-1.5 px-4 py-3.5 text-[15px] font-medium whitespace-nowrap transition-colors hover:bg-wash",
            tab.active ? "text-ink" : "text-ink-muted",
          )}
        >
          {tab.label}
          {tab.badge ? <span className="rounded-full bg-primary px-1.5 font-mono text-[11px] leading-5 text-primary-ink tabular">{tab.badge}</span> : null}
          {tab.active ? <span className="absolute inset-x-4 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
        </Link>
      ))}
    </nav>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-sm gap-2 px-6 py-16 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="text-[15px] text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function EndOfList({ children }: { children: ReactNode }) {
  return <p className="px-6 py-10 text-center text-sm text-ink-muted">{children}</p>;
}

export function Section({ title, meta, children, className }: { title: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-hairline px-4 py-5 sm:px-6", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {meta ? <span className="font-mono text-xs text-ink-muted">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Chip({ children, tone = "muted", className }: { children: ReactNode; tone?: "muted" | "primary" | "warning" | "danger"; className?: string }) {
  const tones = {
    muted: "bg-wash text-ink-muted",
    primary: "bg-primary-soft text-primary",
    warning: "bg-[color-mix(in_srgb,var(--colour-1)_18%,transparent)] text-ink",
    danger: "bg-destructive-soft text-destructive",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}
