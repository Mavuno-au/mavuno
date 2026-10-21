"use client";

import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { createEvent, updateEvent } from "@/app/actions/events";
import { ActingAsField } from "@/components/community/acting-as-field";
import { ShareDialog } from "@/components/community/share-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/page";
import { useViewer } from "@/components/shell/viewer-context";
import { AU_TIMEZONES, EVENT_CATEGORIES, EVENT_FORMATS, type EventCategory } from "@/lib/catalogue";
import type { AuTimezone, EventFormat, SavedListing } from "@/lib/data/community";
import type { City } from "@/lib/data/shell";
import { prepareImage, uploadMedia } from "@/lib/upload";

export type EventDraft = {
  title: string;
  description: string;
  category: EventCategory;
  format: EventFormat;
  timezone: AuTimezone;
  startsAt: string;
  endsAt: string;
  cityId: number | null;
  venue: string;
  address: string;
  onlineUrl: string;
  ticketUrl: string;
  coverUrl: string | null;
  free: boolean;
  capacity: number | null;
  spaceId: string | null;
};

type Target = { kind: "create" } | { kind: "edit"; eventId: string; hostId: string; draft: EventDraft };
type Cover = { kind: "none" } | { kind: "uploading" } | { kind: "set"; url: string };
type SpaceOption = { id: string; name: string; emoji: string | null };

const STATE_ZONES: Record<string, AuTimezone> = {
  QLD: "Australia/Brisbane",
  NSW: "Australia/Sydney",
  ACT: "Australia/Sydney",
  VIC: "Australia/Sydney",
  TAS: "Australia/Sydney",
  SA: "Australia/Adelaide",
  NT: "Australia/Darwin",
  WA: "Australia/Perth",
};

const zoneFor = (cities: City[], cityId: number | null): AuTimezone => STATE_ZONES[cities.find((city) => city.id === cityId)?.state ?? ""] ?? "Australia/Sydney";

export function EventForm({ target, cities, spaces }: { target: Target; cities: City[]; spaces: SpaceOption[] }) {
  const viewer = useViewer();
  const router = useRouter();
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const initialCity = target.kind === "edit" ? target.draft.cityId : (viewer?.cityId ?? null);
  const draft: EventDraft =
    target.kind === "edit"
      ? target.draft
      : {
          title: "",
          description: "",
          category: "community",
          format: "in_person",
          timezone: zoneFor(cities, initialCity),
          startsAt: "",
          endsAt: "",
          cityId: initialCity,
          venue: "",
          address: "",
          onlineUrl: "",
          ticketUrl: "",
          coverUrl: null,
          free: true,
          capacity: null,
          spaceId: null,
        };

  const [hostId, setHostId] = useState(target.kind === "edit" ? target.hostId : (viewer?.id ?? ""));
  const [format, setFormat] = useState(draft.format);
  const [timezone, setTimezone] = useState(draft.timezone);
  const [cover, setCover] = useState<Cover>(draft.coverUrl ? { kind: "set", url: draft.coverUrl } : { kind: "none" });
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SavedListing | null>(null);
  const [pending, startTransition] = useTransition();

  if (created) return <Created saved={created} />;

  async function pickCover(file: File) {
    const previous = cover;
    setCover({ kind: "uploading" });
    try {
      const image = await prepareImage(file, 1600);
      URL.revokeObjectURL(image.preview);
      const uploaded = await uploadMedia({ ownerId: hostId, kind: "events", blob: image.blob });
      setCover({ kind: "set", url: uploaded.url });
    } catch (problem) {
      setCover(previous);
      toast.error(problem instanceof Error ? problem.message : "Couldn't add that image.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = target.kind === "create" ? await createEvent(data) : await updateEvent(target.eventId, data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (target.kind === "create") {
        setCreated(result.data);
        window.scrollTo({ top: 0 });
        return;
      }
      toast("Saved");
      router.push(`/events/${result.data.id}`);
      router.refresh();
    });
  }

  const field = (name: string) => `${formId}-${name}`;

  return (
    <form onSubmit={submit} className="grid gap-5 px-4 py-5 sm:px-6">
      {target.kind === "create" ? <ActingAsField name="hostId" label="Host" onChange={setHostId} /> : null}

      <Field label="Title" htmlFor={field("title")}>
        <Input id={field("title")} name="title" required minLength={3} maxLength={120} defaultValue={draft.title} />
      </Field>
      <Field label="Description" htmlFor={field("description")} hint="What should people expect? Links, @mentions and #topics work.">
        <Textarea id={field("description")} name="description" maxLength={4000} rows={6} defaultValue={draft.description} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category" htmlFor={field("category")}>
          <Select id={field("category")} name="category" defaultValue={draft.category}>
            {Object.entries(EVENT_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format" htmlFor={field("format")}>
          <Select id={field("format")} name="format" value={format} onChange={(event) => setFormat(formatFrom(event.target.value))}>
            {Object.entries(EVENT_FORMATS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Starts" htmlFor={field("startsAt")}>
          <Input id={field("startsAt")} name="startsAt" type="datetime-local" required defaultValue={draft.startsAt} />
        </Field>
        <Field label="Ends (optional)" htmlFor={field("endsAt")}>
          <Input id={field("endsAt")} name="endsAt" type="datetime-local" defaultValue={draft.endsAt} />
        </Field>
      </div>
      <Field label="Time zone" htmlFor={field("timezone")} hint="The times above are in this time zone.">
        <Select id={field("timezone")} name="timezone" value={timezone} onChange={(event) => setTimezone(zoneFrom(event.target.value))}>
          {AU_TIMEZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={format === "online" ? "City (optional)" : "City"} htmlFor={field("cityId")} hint={format === "online" ? "Where the host is based, so people nearby find it." : undefined}>
        <Select
          id={field("cityId")}
          name="cityId"
          required={format !== "online"}
          defaultValue={draft.cityId ?? ""}
          onChange={(event) => setTimezone(zoneFor(cities, Number(event.target.value) || null))}
        >
          <option value="">Choose a city</option>
          {cities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}, {city.state}
            </option>
          ))}
        </Select>
      </Field>
      {format !== "online" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Venue (optional)" htmlFor={field("venue")}>
            <Input id={field("venue")} name="venue" maxLength={120} defaultValue={draft.venue} />
          </Field>
          <Field label="Address (optional)" htmlFor={field("address")}>
            <Input id={field("address")} name="address" maxLength={200} defaultValue={draft.address} />
          </Field>
        </div>
      ) : null}
      {format !== "in_person" ? (
        <Field label="Online link" htmlFor={field("onlineUrl")} hint="Shown to people who say they're going.">
          <Input id={field("onlineUrl")} name="onlineUrl" inputMode="url" autoComplete="off" placeholder="https://" required defaultValue={draft.onlineUrl} />
        </Field>
      ) : null}

      <Field label="Tickets or registration link (optional)" htmlFor={field("ticketUrl")}>
        <Input id={field("ticketUrl")} name="ticketUrl" inputMode="url" autoComplete="off" placeholder="https://" defaultValue={draft.ticketUrl} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Clears the neighbouring label so the box lines up with the capacity input, not its hint. */}
        <div className="sm:pt-8.5">
          <Checkbox name="free" label="Free to attend" defaultChecked={draft.free} />
        </div>
        <Field label="Capacity (optional)" htmlFor={field("capacity")} hint="RSVPs close when this many people are going.">
          <Input id={field("capacity")} name="capacity" type="number" inputMode="numeric" min={1} max={100000} defaultValue={draft.capacity ?? ""} />
        </Field>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Cover image (optional)</span>
        <input type="hidden" name="coverUrl" value={cover.kind === "set" ? cover.url : ""} />
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label="Choose a cover image"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void pickCover(file);
          }}
        />
        {cover.kind === "set" ? <img src={cover.url} alt="" className="aspect-[2/1] w-full rounded-lg border border-hairline object-cover" /> : null}
        {cover.kind === "uploading" ? <div aria-hidden className="aspect-[2/1] w-full animate-pulse rounded-lg bg-wash" /> : null}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={cover.kind === "uploading"} onClick={() => fileInput.current?.click()} className="min-w-36">
            <ImagePlus /> {cover.kind === "none" ? "Add a cover image" : cover.kind === "uploading" ? "Uploading…" : "Change image"}
          </Button>
          {cover.kind === "set" ? (
            <Button size="sm" variant="ghost" onClick={() => setCover({ kind: "none" })}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {spaces.length > 0 ? (
        <Field label="Space (optional)" htmlFor={field("spaceId")} hint="The event also shows in this space.">
          <Select id={field("spaceId")} name="spaceId" defaultValue={draft.spaceId ?? ""}>
            <option value="">No space</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.emoji ? `${space.emoji} ` : ""}
                {space.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending || cover.kind === "uploading"} className="min-w-40">
          {pending ? "Saving…" : target.kind === "create" ? "Create event" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function formatFrom(value: string): EventFormat {
  return value === "online" || value === "hybrid" ? value : "in_person";
}

function zoneFrom(value: string): AuTimezone {
  return AU_TIMEZONES.find((zone) => zone.value === value)?.value ?? "Australia/Sydney";
}

function Created({ saved }: { saved: SavedListing }) {
  const [sharing, setSharing] = useState(false);
  const view = (
    <ButtonLink href={`/events/${saved.id}`} variant="outline">
      View event
    </ButtonLink>
  );

  if (saved.status !== "published") {
    return (
      <EmptyState title="Sent for review" action={view}>
        A moderator will check it, usually within a day. Until then only its hosts can see it, on its page.{" "}
        <Link href="/help#sent-for-review" className="text-primary hover:underline">What this means</Link>
      </EmptyState>
    );
  }

  return (
    <>
      <EmptyState
        title="Your event is up"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setSharing(true)}>Share to your followers</Button>
            {view}
          </div>
        }
      >
        People can find it in Events and RSVP now.
      </EmptyState>
      <ShareDialog shared={{ eventId: saved.id }} open={sharing} onClose={() => setSharing(false)} />
    </>
  );
}
