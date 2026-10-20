"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CopySwatch({ name, hex }: { name: string; hex: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the colour");
    }
  }

  return (
    <button type="button" onClick={copy} aria-label={`Copy ${name}, ${hex}`} className="group grid gap-1.5 text-left">
      <span className="flex h-14 items-center justify-center rounded-lg border border-hairline" style={{ backgroundColor: hex }}>
        {copied ? <Check className="size-5 text-white mix-blend-difference" aria-hidden /> : null}
      </span>
      <span className="text-sm font-medium">{name}</span>
      <span className="font-mono text-xs text-ink-muted uppercase group-hover:text-primary">{copied ? "Copied" : hex}</span>
    </button>
  );
}
