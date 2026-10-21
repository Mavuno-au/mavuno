"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { RulesDialog } from "@/components/moderation/rules-dialog";
import { Composer } from "@/components/post/composer";
import { postPath } from "@/components/post/post-item";
import { useViewer } from "@/components/shell/viewer-context";
import { Dialog } from "@/components/ui/dialog";

const ComposeContext = createContext<{ open: () => void }>({ open: () => {} });

// Whether the member has accepted the community rules, and a way to ask them
// to before they post. Outside the shell there is nothing to ask with, so
// posting goes ahead and the database answers.
const RulesContext = createContext<{ ensure: () => Promise<boolean> }>({ ensure: () => Promise.resolve(true) });

export function ComposeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const viewer = useViewer();
  const [isOpen, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(viewer?.rulesAccepted ?? true);
  const [asking, setAsking] = useState(false);
  const answer = useRef<((accepted: boolean) => void) | null>(null);

  const ensure = useCallback(() => {
    if (accepted) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      answer.current?.(false);
      answer.current = resolve;
      setAsking(true);
    });
  }, [accepted]);

  function settle(result: boolean) {
    setAsking(false);
    if (result) setAccepted(true);
    answer.current?.(result);
    answer.current = null;
  }

  const rules = useMemo(() => ({ ensure }), [ensure]);
  const value = useMemo(
    () => ({
      open: () => {
        void ensure().then((ok) => {
          if (ok) setOpen(true);
        });
      },
    }),
    [ensure],
  );

  return (
    <RulesContext value={rules}>
      <ComposeContext value={value}>
        {children}
        <RulesDialog open={asking} onAccepted={() => settle(true)} onClose={() => settle(false)} />
        {/* On phones writing gets the whole screen above the keyboard, as a sheet. */}
        <Dialog
          open={isOpen}
          onClose={() => setOpen(false)}
          title="New post"
          className="max-md:mt-(--visual-viewport-top,0px) max-md:mb-0 max-md:h-(--visual-viewport-height,100dvh) max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0"
        >
          <Composer
            mode={{ kind: "post" }}
            autoFocus
            roomy
            onPosted={(row) => {
              setOpen(false);
              if (row.kind === "post") router.push(postPath(row));
            }}
          />
        </Dialog>
      </ComposeContext>
    </RulesContext>
  );
}

export function useCompose() {
  return use(ComposeContext);
}

export function useRules() {
  return use(RulesContext);
}
