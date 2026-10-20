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
      <Dialog open={isOpen} onClose={() => setOpen(false)} title="New post">
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
