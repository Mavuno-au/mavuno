"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MenuItem =
  | { kind: "action"; label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean }
  | { kind: "link"; label: string; icon?: ReactNode; href: string };

export function Menu({
  items,
  label = "More",
  trigger,
  align = "end",
  placement = "below",
}: {
  items: MenuItem[];
  label?: string;
  trigger?: ReactNode;
  align?: "start" | "end";
  placement?: "below" | "above";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const outside = event.target instanceof Node && !root.current?.contains(event.target);
      if (event instanceof KeyboardEvent ? event.key === "Escape" : outside) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="rounded-md p-1.5 text-ink-muted hover:bg-wash hover:text-ink"
      >
        {trigger ?? <MoreHorizontal className="size-4" />}
      </button>
      {open ? (
        <div
          id={id}
          role="menu"
          className={cn(
            "animate-fade-in absolute z-30 min-w-48 overflow-hidden rounded-lg border border-hairline bg-popover py-1 shadow-lg",
            placement === "below" ? "top-full mt-1" : "bottom-full mb-1",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => {
            const className = cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-wash [&_svg]:size-4",
              item.kind === "action" && item.danger ? "text-destructive" : "text-ink",
            );
            return item.kind === "link" ? (
              <Link key={item.label} role="menuitem" href={item.href} className={className} onClick={() => setOpen(false)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                className={className}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
