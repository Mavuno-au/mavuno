"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// A modal on the native <dialog>, which brings Escape handling, focus
// containment and the top layer for free.
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-hairline bg-popover p-0 text-ink shadow-xl backdrop:bg-black/40",
        // On phones the dialog sits in the part of the screen the keyboard leaves visible.
        "max-h-[min(calc(var(--visual-viewport-height,100dvh)-2rem),48rem)] open:flex open:flex-col max-md:mt-[calc(var(--visual-viewport-top,0px)+1rem)] max-md:mb-auto",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 rounded-md p-1.5 text-ink-muted hover:bg-wash hover:text-ink max-md:p-2.5">
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
