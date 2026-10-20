"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { createOpportunity, updateOpportunity } from "@/app/actions/opportunities";
import { ActingAsField } from "@/components/community/acting-as-field";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { useViewer } from "@/components/shell/viewer-context";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import type { City } from "@/lib/data/shell";
import type { OpportunityType } from "@/lib/domain";

export type OpportunityDraft = {
  type: OpportunityType;
  title: string;
  organisation: string;
  description: string;
  cityId: number | null;
  remote: boolean;
  location: string;
  applyUrl: string;
  applyEmail: string;
  deadline: string;
  compensation: string;
};

type Target = { kind: "create" } | { kind: "edit"; opportunityId: string; draft: OpportunityDraft };

export function OpportunityForm({ target, cities }: { target: Target; cities: City[] }) {
  const viewer = useViewer();
  const router = useRouter();
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draft: OpportunityDraft =
    target.kind === "edit"
      ? target.draft
      : {
          type: "job",
          title: "",
          organisation: "",
          description: "",
          cityId: viewer?.cityId ?? null,
          remote: false,
          location: "",
          applyUrl: "",
          applyEmail: "",
          deadline: "",
          compensation: "",
        };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = target.kind === "create" ? await createOpportunity(data) : await updateOpportunity(target.opportunityId, data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast(
        target.kind === "edit"
          ? "Saved"
          : result.data.status === "published"
            ? "Posted. Share it from its page so your followers see it."
            : "Sent for review. A moderator will check it, usually within a day.",
      );
      router.push(`/opportunities/${result.data.id}`);
      router.refresh();
    });
  }

  const field = (name: string) => `${formId}-${name}`;

  return (
    <form onSubmit={submit} className="grid gap-5 px-4 py-5 sm:px-6">
      {target.kind === "create" ? <ActingAsField name="posterId" label="Post as" /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type" htmlFor={field("type")}>
          <Select id={field("type")} name="type" defaultValue={draft.type}>
            {Object.entries(OPPORTUNITY_TYPES).map(([value, type]) => (
              <option key={value} value={value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Organisation (optional)" htmlFor={field("organisation")} hint="Who is offering it, if not you.">
          <Input id={field("organisation")} name="organisation" maxLength={120} defaultValue={draft.organisation} />
        </Field>
      </div>
      <Field label="Title" htmlFor={field("title")}>
        <Input id={field("title")} name="title" required minLength={3} maxLength={120} defaultValue={draft.title} />
      </Field>
      <Field label="Description" htmlFor={field("description")} hint="Who it's for, what's involved and how to apply.">
        <Textarea id={field("description")} name="description" required minLength={10} maxLength={6000} rows={8} defaultValue={draft.description} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="City (optional)" htmlFor={field("cityId")}>
          <Select id={field("cityId")} name="cityId" defaultValue={draft.cityId ?? ""}>
            <option value="">Anywhere</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}, {city.state}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location details (optional)" htmlFor={field("location")} hint="A suburb, campus or region.">
          <Input id={field("location")} name="location" maxLength={120} defaultValue={draft.location} />
        </Field>
      </div>
      <Checkbox name="remote" label="Can be done remotely" defaultChecked={draft.remote} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Apply link" htmlFor={field("applyUrl")} hint="A link, an email address, or both.">
          <Input id={field("applyUrl")} name="applyUrl" inputMode="url" autoComplete="off" placeholder="https://" defaultValue={draft.applyUrl} />
        </Field>
        <Field label="Apply by email" htmlFor={field("applyEmail")}>
          <Input id={field("applyEmail")} name="applyEmail" type="email" autoComplete="off" maxLength={200} defaultValue={draft.applyEmail} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Deadline (optional)" htmlFor={field("deadline")} hint="Closes at the end of this day.">
          <Input id={field("deadline")} name="deadline" type="date" defaultValue={draft.deadline} />
        </Field>
        <Field label="Pay or value (optional)" htmlFor={field("compensation")} hint="For example $70k to $85k, or $5,000 grant.">
          <Input id={field("compensation")} name="compensation" maxLength={120} defaultValue={draft.compensation} />
        </Field>
      </div>

      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="min-w-40">
          {pending ? "Saving…" : target.kind === "create" ? "Post opportunity" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
