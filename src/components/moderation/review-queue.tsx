"use client";

import { Check, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { approveAll, moderate } from "@/app/actions/moderation";
import { Author } from "@/components/moderation/author";
import { SubjectPreview } from "@/components/moderation/preview";
import { ReasonField } from "@/components/moderation/reason-field";
import { RuleSelect } from "@/components/moderation/rule-select";
import { useSave } from "@/components/settings/use-save";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { Chip, EmptyState } from "@/components/ui/page";
import { languageName } from "@/lib/catalogue";
import type { ReviewItem } from "@/lib/data/moderation";
import type { BreakableRule } from "@/lib/rules";

const kindLabel = (item: ReviewItem) => {
  switch (item.targetType) {
    case "post":
      return item.reply ? "Reply" : "Post";
    case "event":
      return "Event";
    case "opportunity":
      return "Opportunity";
    default: {
      const exhaustive: never = item.targetType;
      return exhaustive;
    }
  }
};

function Keycap({ label }: { label: string }) {
  return (
    <kbd aria-hidden className="-mr-1 hidden rounded border border-current/30 px-1 font-mono text-[11px] leading-4 opacity-70 sm:inline-block">
      {label}
    </kbd>
  );
}

function ReviewRow({ item, onDone, onMove }: { item: ReviewItem; onDone: () => void; onMove: (step: 1 | -1) => void }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [rule, setRule] = useState<BreakableRule | null>(null);
  const { pending, error, save } = useSave();

  const target = { targetType: item.targetType, targetId: item.targetId };
  const decide = (approve: boolean) => save(() => moderate(approve ? { ...target, approve } : { ...target, approve, reason, rule }), undefined, onDone);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey || event.altKey || pending) return;
    const actions: Record<string, () => void> = { a: () => decide(true), x: () => decide(false), j: () => onMove(1), k: () => onMove(-1) };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  return (
    <article
      tabIndex={0}
      data-review-item
      onKeyDown={onKeyDown}
      aria-label={`${kindLabel(item)} by ${item.author ? `@${item.author.username}` : "a deleted account"}`}
      className="border-b border-hairline px-4 py-4 outline-none focus-visible:bg-wash sm:px-6"
    >
      <div className="flex items-start justify-between gap-3">
        <Author profile={item.author} meta={<LocalTime iso={item.createdAt} />} />
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <Chip>{kindLabel(item)}</Chip>
          {item.targetType === "post" ? <Chip>{languageName(item.language)}</Chip> : null}
        </div>
      </div>
      {item.note ? (
        <p className="mt-3">
          <Chip tone="warning">{item.note}</Chip>
        </p>
      ) : null}
      <SubjectPreview subject={item.subject} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide(true)} aria-keyshortcuts="a">
          <Check />
          Approve
          <Keycap label="a" />
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)} aria-keyshortcuts="x">
          <X />
          Reject
          <Keycap label="x" />
        </Button>
        <RuleSelect value={rule} onChange={setRule} disabled={pending} />
        {reasonOpen ? null : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setReasonOpen(true)}>
            Add reason
          </Button>
        )}
      </div>
      {reasonOpen ? <ReasonField value={reason} onChange={setReason} disabled={pending} /> : null}
      <FormError message={error} />
    </article>
  );
}

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const list = useRef<HTMLDivElement>(null);
  const { pending, error, save } = useSave();
  const visible = items.filter((item) => !done.has(item.targetId));

  const rows = () => [...(list.current?.querySelectorAll<HTMLElement>("[data-review-item]") ?? [])];

  function move(from: number, step: 1 | -1) {
    rows()[from + step]?.focus();
  }

  // Keeps the keyboard flow going: the next item takes the decided one's place.
  function finish(index: number, targetId: string) {
    const hadFocus = list.current?.contains(document.activeElement) ?? false;
    setDone((current) => new Set(current).add(targetId));
    if (hadFocus) requestAnimationFrame(() => (rows()[index] ?? rows().at(-1))?.focus());
  }

  if (visible.length === 0) {
    return <EmptyState title="Nothing to review">New posts, events and opportunities that need a look show up here, oldest first.</EmptyState>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-6">
        <p className="text-sm text-ink-muted">
          Oldest first. Focus an item, then press <kbd className="font-mono text-xs">a</kbd> to approve, <kbd className="font-mono text-xs">x</kbd> to reject once you've chosen the rule, <kbd className="font-mono text-xs">j</kbd>/<kbd className="font-mono text-xs">k</kbd> to move.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          className="min-w-44"
          onClick={() =>
            save(
              () => approveAll(visible.map((item) => ({ targetType: item.targetType, targetId: item.targetId }))),
              `Approved ${visible.length === 1 ? "1 item" : `${visible.length} items`}`,
              () => setDone(new Set(items.map((item) => item.targetId))),
            )
          }
        >
          {pending ? "Approving…" : `Approve all on this page (${visible.length})`}
        </Button>
        {error ? <FormError message={error} /> : null}
      </div>
      <div ref={list}>
        {visible.map((item, index) => (
          <ReviewRow key={item.targetId} item={item} onDone={() => finish(index, item.targetId)} onMove={(step) => move(index, step)} />
        ))}
      </div>
    </>
  );
}
