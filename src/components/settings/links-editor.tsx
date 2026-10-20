"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export type ProfileLink = { label: string; url: string };

const MAX_LINKS = 5;

export function LinksEditor({ links, onChange }: { links: ProfileLink[]; onChange: (links: ProfileLink[]) => void }) {
  const edit = (index: number, change: Partial<ProfileLink>) => onChange(links.map((link, at) => (at === index ? { ...link, ...change } : link)));
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 flex w-full items-baseline justify-between text-sm font-medium">
        Links
        <span className="font-mono text-xs font-normal text-ink-muted tabular">
          {links.length}/{MAX_LINKS}
        </span>
      </legend>
      {links.map((link, index) => (
        <div key={index} className="flex gap-2">
          <Input aria-label={`Label for link ${index + 1}`} placeholder="Label" maxLength={40} value={link.label} onChange={(event) => edit(index, { label: event.target.value })} className="w-28 shrink-0 sm:w-36" />
          <Input aria-label={`Address for link ${index + 1}`} placeholder="https://" inputMode="url" maxLength={200} value={link.url} onChange={(event) => edit(index, { url: event.target.value })} />
          <Button variant="ghost" size="icon" aria-label={`Remove link ${index + 1}`} onClick={() => onChange(links.filter((_, at) => at !== index))}>
            <X />
          </Button>
        </div>
      ))}
      {links.length < MAX_LINKS ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => onChange([...links, { label: "", url: "" }])}>
            <Plus />
            Add a link
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
