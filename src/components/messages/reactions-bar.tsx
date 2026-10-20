"use client";

import type { Reaction } from "@/lib/data/messages";
import { cn } from "@/lib/cn";

export const QUICK_REACTIONS = ["❤️", "😂", "👍", "🙏", "🔥"] as const;

type Tally = { emoji: string; count: number; mine: boolean };

function tally(reactions: Reaction[], viewerId: string): Tally[] {
  const byEmoji = new Map<string, Tally>();
  for (const reaction of reactions) {
    const current = byEmoji.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
    byEmoji.set(reaction.emoji, { ...current, count: current.count + 1, mine: current.mine || reaction.userId === viewerId });
  }
  return [...byEmoji.values()];
}

export function ReactionsBar({ reactions, viewerId, onToggle }: { reactions: Reaction[]; viewerId: string; onToggle?: (emoji: string) => void }) {
  if (reactions.length === 0) return null;
  return (
    <div className="-mt-1.5 flex flex-wrap gap-1 px-1">
      {tally(reactions, viewerId).map(({ emoji, count, mine }) => (
        <button
          key={emoji}
          type="button"
          aria-pressed={mine}
          aria-label={`${emoji} ${count}. ${mine ? "Remove your reaction" : "Add this reaction"}`}
          disabled={!onToggle}
          onClick={() => onToggle?.(emoji)}
          className={cn(
            "flex h-6 items-center gap-1 rounded-full border px-1.5 text-sm leading-none",
            mine ? "border-primary bg-primary-soft" : "border-hairline bg-surface enabled:hover:bg-wash",
          )}
        >
          <span>{emoji}</span>
          {count > 1 ? <span className="font-mono text-[11px] text-ink-muted tabular">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function QuickReactions({ reactions, viewerId, onToggle }: { reactions: Reaction[]; viewerId: string; onToggle: (emoji: string) => void }) {
  return (
    <>
      {QUICK_REACTIONS.map((emoji) => {
        const mine = reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === viewerId);
        return (
          <button
            key={emoji}
            type="button"
            aria-label={mine ? `Remove ${emoji}` : `React with ${emoji}`}
            aria-pressed={mine}
            onClick={() => onToggle(emoji)}
            className={cn("flex size-8 items-center justify-center rounded-full text-lg leading-none hover:bg-wash", mine && "bg-primary-soft")}
          >
            {emoji}
          </button>
        );
      })}
    </>
  );
}
