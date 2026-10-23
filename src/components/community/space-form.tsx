"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createSpace } from "@/app/actions/spaces";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import type { City } from "@/lib/data/shell";
import { cn } from "@/lib/cn";
import { reach } from "@/lib/version";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const KINDS = [
  { value: "interest", label: "An interest", hint: "A topic, profession or group of people." },
  { value: "city", label: "A place", hint: "A suburb, town or region." },
] as const;

export function SpaceForm({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("interest");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await reach(createSpace(data));
      if (result.ok) router.push(`/spaces/${result.data}`);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-5 px-4 py-5 sm:px-6">
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">What is it for?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                kind === option.value ? "border-primary bg-primary-soft" : "border-rail hover:bg-wash",
              )}
            >
              <input type="radio" name="kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className="mt-1 accent-(--primary)" />
              <span className="grid gap-0.5">
                <span className="text-[15px] font-medium">{option.label}</span>
                <span className="text-sm text-ink-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label="Emoji" htmlFor="space-emoji">
          <Input id="space-emoji" name="emoji" maxLength={16} placeholder="🌍" className="text-center" />
        </Field>
        <Field label="Name" htmlFor="space-name">
          <Input id="space-name" name="name" required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
      </div>
      <Field label="Address" htmlFor="space-slug" hint="Lowercase letters, numbers and dashes.">
        <div className="flex items-center rounded-md border border-rail bg-surface focus-within:border-primary">
          <span className="pl-3 font-mono text-[13px] text-ink-muted">/spaces/</span>
          <input
            id="space-slug"
            name="slug"
            required
            pattern="[a-z0-9\-]{2,40}"
            maxLength={40}
            value={slug ?? slugify(name)}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            className="h-10 min-w-0 flex-1 bg-transparent pr-3 font-mono text-[15px] focus:outline-none"
          />
        </div>
      </Field>
      {kind === "city" ? (
        <Field label="City or nearest city" htmlFor="space-city">
          <Select id="space-city" name="cityId" required defaultValue="">
            <option value="">Choose a city</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}, {city.state}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Description" htmlFor="space-description" hint="What people talk about here. Up to 500 characters.">
        <Textarea id="space-description" name="description" maxLength={500} rows={4} />
      </Field>

      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="min-w-36">
          {pending ? "Starting…" : "Start the space"}
        </Button>
      </div>
    </form>
  );
}
