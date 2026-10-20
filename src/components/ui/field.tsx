import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-rail bg-surface px-3 text-[15px] text-ink placeholder:text-ink-muted/70 focus:border-primary focus:outline-none disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y overflow-x-hidden py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10 pr-8", className)} {...props} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  // A taller neighbour in a row stretches this grid; content-start keeps the
  // extra height below the hint instead of pushing the control down.
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-1 size-4 accent-(--primary)" {...props} />
      <span className="grid gap-0.5">
        <span className="text-[15px]">{label}</span>
        {hint ? <span className="text-sm text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  return (
    <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
      {message}
    </p>
  );
}
