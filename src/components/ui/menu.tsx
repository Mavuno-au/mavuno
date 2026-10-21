"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MenuItem =
  | { kind: "action"; label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean }
  | { kind: "link"; label: string; icon?: ReactNode; href: string };

// Closed, or open with the item that should hold focus.
type State = { kind: "closed" } | { kind: "open"; focus: "first" | "last" };

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
  const [state, setState] = useState<State>({ kind: "closed" });
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const open = state.kind === "open";

  useEffect(() => {
    if (state.kind !== "open") return;
    const options = menuItems();
    options[state.focus === "first" ? 0 : options.length - 1]?.focus();
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setState({ kind: "closed" });
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [state]);

  function menuItems() {
    return [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  }

  // Closing from the keyboard, or by choosing, puts focus back on the trigger
  // so a dialog the choice opens knows where to return to.
  function closeAndRefocus() {
    setState({ kind: "closed" });
    button.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    setState({ kind: "open", focus: event.key === "ArrowDown" ? "first" : "last" });
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const options = menuItems();
    const index = options.findIndex((option) => option === document.activeElement);
    const move = (to: number) => {
      event.preventDefault();
      options[(to + options.length) % options.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return move(index + 1);
      case "ArrowUp":
        return move(index - 1);
      case "Home":
        return move(0);
      case "End":
        return move(options.length - 1);
      case "Escape":
        // Only the menu closes, not a dialog it sits in.
        event.preventDefault();
        event.stopPropagation();
        return closeAndRefocus();
      case "Tab":
        return setState({ kind: "closed" });
    }
  }

  if (items.length === 0) return null;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onKeyDown={onTriggerKeyDown}
        onClick={(event) => {
          event.stopPropagation();
          setState(open ? { kind: "closed" } : { kind: "open", focus: "first" });
        }}
        className="rounded-md p-1.5 text-ink-muted hover:bg-wash hover:text-ink max-md:p-2.5"
      >
        {trigger ?? <MoreHorizontal className="size-4" />}
      </button>
      {open ? (
        <div
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "animate-fade-in absolute z-30 min-w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-hairline bg-popover py-1 shadow-lg",
            placement === "below" ? "top-full mt-1" : "bottom-full mb-1",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => {
            const className = cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-wash focus-visible:bg-wash focus-visible:outline-none max-md:min-h-11 [&_svg]:size-4",
              item.kind === "action" && item.danger ? "text-destructive" : "text-ink",
            );
            return item.kind === "link" ? (
              <Link key={item.label} role="menuitem" tabIndex={-1} href={item.href} className={className} onClick={() => setState({ kind: "closed" })}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                tabIndex={-1}
                type="button"
                className={className}
                onClick={(event) => {
                  event.stopPropagation();
                  closeAndRefocus();
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
