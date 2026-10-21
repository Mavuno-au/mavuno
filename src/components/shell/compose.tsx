"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { Composer } from "@/components/post/composer";
import { postPath } from "@/components/post/post-item";
import { Dialog } from "@/components/ui/dialog";

const ComposeContext = createContext<{ open: () => void }>({ open: () => {} });

export function ComposeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <ComposeContext value={value}>
      {children}
      {/* On phones writing gets the whole screen above the keyboard, as a sheet. */}
      <Dialog
        open={isOpen}
        onClose={() => setOpen(false)}
        title="New post"
        className="max-md:mt-(--visual-viewport-top,0px) max-md:mb-0 max-md:h-(--visual-viewport-height,100dvh) max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0"
      >
        {isOpen ? (
          <Composer
            mode={{ kind: "post" }}
            autoFocus
            onPosted={(row) => {
              setOpen(false);
              if (row.kind === "post") router.push(postPath(row));
            }}
          />
        ) : null}
      </Dialog>
    </ComposeContext>
  );
}

export function useCompose() {
  return use(ComposeContext);
}
