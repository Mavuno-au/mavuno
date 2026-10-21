"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// A modal on the native <dialog>, which brings Escape handling, focus
// containment and the top layer for free. A dialog that isn't dismissible
// has no Close, ignores Escape and clicks outside, and reopens if the
// browser closes it anyway: the only ways out are the ones it offers.
export function Dialog({
  open,
  onClose,
  onKeyDown,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDialogElement>) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The browser hands focus back on close only when it still knows the
  // opener; a dialog opened from a menu item that has since unmounted would
  // otherwise leave focus on the body.
  function closed() {
    if (!dismissible && open) {
      ref.current?.showModal();
      return;
    }
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected && (document.activeElement === document.body || ref.current?.contains(document.activeElement))) target.focus();
    onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={closed}
      onCancel={(event) => !dismissible && event.preventDefault()}
      onKeyDown={onKeyDown}
      onClick={(event) => dismissible && event.target === ref.current && ref.current.close()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-hairline bg-popover p-0 text-ink shadow-xl backdrop:bg-black/40",
        // On phones the dialog sits in the part of the screen the keyboard leaves visible.
        "max-h-[min(calc(var(--visual-viewport-height,100dvh)-2rem),48rem)] open:flex open:flex-col max-md:mt-[calc(var(--visual-viewport-top,0px)+1rem)] max-md:mb-auto",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <h2 id={titleId} className="font-semibold">
          {title}
        </h2>
        {dismissible ? (
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="-mr-2 rounded-md p-1.5 text-ink-muted hover:bg-wash hover:text-ink max-md:p-2.5">
            <X className="size-5" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {description ? (
          <p id={descriptionId} className="text-[15px] text-ink-muted">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {footer ? <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
