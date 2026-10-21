"use client";

import { BarChart3, CalendarClock, Eye, ImagePlus, Link2, Link2Off, PenLine, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { createPost, schedulePost } from "@/app/actions/posts";
import { awaitCard, QuotedBlock } from "@/components/post/attachments";
import { MentionMenu, useMentions } from "@/components/post/mentions";
import { ProgressAvatar } from "@/components/post/progress-avatar";
import { RichText } from "@/components/post/rich-text";
import { SchedulePicker } from "@/components/post/schedule-picker";
import { Button } from "@/components/ui/button";
import { useNow } from "@/components/ui/local-time";
import { useViewer } from "@/components/shell/viewer-context";
import { LANGUAGES, LIMITS, POLL_DURATIONS } from "@/lib/catalogue";
import { cn } from "@/lib/cn";
import type { Post, PostRow } from "@/lib/domain";
import { fullDate } from "@/lib/format";
import { findPersonalInfo, personalInfoWarning, type PersonalInfo } from "@/lib/personal-info";
import { initialSchedule, scheduledDate, scheduleProblem, type ScheduleDraft } from "@/lib/schedule";
import { displayUrl, tokenize } from "@/lib/text";
import { draftPrefix } from "@/lib/browser-data";
import { useDraft } from "@/lib/use-draft";
import { prepareImage, removeMedia, uploadMedia, type PreparedImage } from "@/lib/upload";

export type ComposerMode =
  | { kind: "post"; spaceId?: string; eventId?: string; opportunityId?: string; placeholder?: string }
  | { kind: "reply"; parent: Post }
  | { kind: "quote"; quoted: Post };

type Attachment = PreparedImage & { key: string; alt: string };
type PollDraft = { options: string[]; durationHours: (typeof POLL_DURATIONS)[number]["hours"] };

const PLACEHOLDERS = { post: "What's happening in your community?", reply: "Write your reply", quote: "Add your take" } as const;

function placeholder(mode: ComposerMode) {
  if (mode.kind === "reply") return `Reply to @${mode.parent.author.username}`;
  return mode.kind === "post" ? (mode.placeholder ?? PLACEHOLDERS.post) : PLACEHOLDERS.quote;
}

// Drafts are kept per place they were started, so an event share and the home
// composer never overwrite each other.
function draftScope(mode: ComposerMode) {
  switch (mode.kind) {
    case "reply":
      return `reply:${mode.parent.id}`;
    case "quote":
      return `quote:${mode.quoted.id}`;
    case "post":
      if (mode.eventId) return `event:${mode.eventId}`;
      if (mode.opportunityId) return `opportunity:${mode.opportunityId}`;
      return `post:${mode.spaceId ?? "home"}`;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

function draftKey(viewerId: string, mode: ComposerMode) {
  return `${draftPrefix(viewerId)}${draftScope(mode)}`;
}

export function Composer({ mode, autoFocus, onPosted, onCancel }: { mode: ComposerMode; autoFocus?: boolean; onPosted?: (row: PostRow) => void; onCancel?: () => void }) {
  const viewer = useViewer();
  const formId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = viewer ? draftKey(viewer.id, mode) : null;

  const { body, setBody, restored } = useDraft(key);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [language, setLanguage] = useState(viewer?.languages[0] ?? "en");
  const [images, setImages] = useState<Attachment[]>([]);
  const [poll, setPoll] = useState<PollDraft | null>(null);
  // undefined: the first link in the post; null: no card; a URL: that link.
  const [cardChoice, setCardChoice] = useState<string | null | undefined>(undefined);
  const [previewing, setPreviewing] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleDraft | null>(null);
  // Personal details found when the writer pressed Post, until they edit or post anyway.
  const [personal, setPersonal] = useState<PersonalInfo[]>([]);
  const now = new Date(useNow());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const mentions = useMentions({
    textarea,
    body,
    setBody,
    viewerId: viewer?.id ?? null,
    context: mode.kind === "reply" ? { kind: "reply", postId: mode.parent.id } : mode.kind === "quote" ? { kind: "quote", postId: mode.quoted.id } : { kind: "none" },
  });

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [body]);

  if (!viewer) {
    return (
      <div className="px-4 py-4 text-[15px] text-ink-muted sm:px-6">
        <Link href="/signup" className="font-medium text-primary hover:underline">Join Mavuno</Link> or <Link href="/login" className="font-medium text-primary hover:underline">sign in</Link> to post.
      </div>
    );
  }

  if (viewer.suspended) {
    return (
      <div className="px-4 py-4 text-[15px] text-ink-muted sm:px-6">
        Your account is suspended, so you can't post right now. The reason and how to ask for another look are in your{" "}
        <Link href="/notifications" className="font-medium text-primary hover:underline">notifications</Link>.
      </div>
    );
  }

  const me = viewer;
  const identities = [me, ...me.organisations];
  const author = identities.find((identity) => identity.id === authorId) ?? viewer;
  const remaining = LIMITS.postBody - body.length;
  const links = [...new Set(tokenize(body).flatMap((segment) => (segment.kind === "url" ? [segment.href] : [])))];
  const card = mode.kind === "quote" || cardChoice === null ? null : cardChoice && links.includes(cardChoice) ? cardChoice : (links[0] ?? null);
  const hasAttachment = images.length > 0 || mode.kind === "quote" || (mode.kind === "post" && Boolean(mode.eventId ?? mode.opportunityId));
  const pollValid = !poll || poll.options.filter((option) => option.trim()).length >= 2;
  const schedulable = mode.kind === "post" && !mode.eventId && !mode.opportunityId;
  const scheduleError = schedule ? scheduleProblem(schedule, now) : null;
  const canSubmit = !pending && remaining >= 0 && (body.trim().length > 0 || hasAttachment) && pollValid && !scheduleError;

  async function addFiles(files: FileList | File[]) {
    const room = LIMITS.images - images.length;
    if (poll) {
      toast.error("A post can have a poll or images, not both.");
      return;
    }
    const picked = Array.from(files);
    if (picked.length > room) toast(`A post can have up to ${LIMITS.images} images, so ${picked.length - room === 1 ? "one was" : `${picked.length - room} were`} left out.`);
    if (picked.some((file) => file.type === "image/gif")) toast("GIFs are posted as still images.");
    for (const file of picked.slice(0, room)) {
      try {
        const prepared = await prepareImage(file);
        setImages((current) => [...current, { ...prepared, key: crypto.randomUUID(), alt: "" }]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't add that image.");
      }
    }
  }

  function onPaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (files.length) {
      event.preventDefault();
      void addFiles(files);
    }
  }

  function onDrop(event: DragEvent) {
    if (event.dataTransfer.files.length) {
      event.preventDefault();
      void addFiles(event.dataTransfer.files);
    }
  }

  function submit({ checked = false } = {}) {
    if (!canSubmit) return;
    const found = checked ? [] : findPersonalInfo(body);
    setPersonal(found);
    if (found.length > 0) return;
    startTransition(async () => {
      const uploaded: { path: string }[] = [];
      try {
        const posted = await Promise.all(
          images.map(async (image) => {
            const file = await uploadMedia({ ownerId: me.id, kind: "posts", blob: image.blob });
            uploaded.push(file);
            return { ...file, alt: image.alt.trim() };
          }),
        );
        const post = {
          body,
          language,
          authorId: author.id === me.id ? null : author.id,
          spaceId: mode.kind === "post" ? (mode.spaceId ?? null) : null,
          linkUrl: card,
          images: posted,
          poll: poll && { options: poll.options.map((option) => option.trim()).filter(Boolean), durationHours: poll.durationHours },
        };
        if (schedule) {
          const scheduledAt = scheduledDate(schedule).toISOString();
          const result = await schedulePost({ ...post, scheduledAt });
          if (!result.ok) {
            await removeMedia(uploaded.map((file) => file.path));
            toast.error(result.error);
            return;
          }
          clear();
          toast(`Scheduled for ${fullDate(scheduledAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}`, {
            action: { label: "View scheduled", onClick: () => router.push("/scheduled") },
          });
          return;
        }

        const result = await createPost({
          ...post,
          parentId: mode.kind === "reply" ? mode.parent.id : null,
          quoteId: mode.kind === "quote" ? mode.quoted.id : null,
          eventId: mode.kind === "post" ? (mode.eventId ?? null) : null,
          opportunityId: mode.kind === "post" ? (mode.opportunityId ?? null) : null,
        });
        if (!result.ok) {
          await removeMedia(uploaded.map((file) => file.path));
          toast.error(result.error);
          return;
        }

        if (result.data.kind === "post" && result.data.linkUrl && !result.data.linkPreview && !result.data.quoteId) awaitCard(result.data.linkUrl, result.data.id);
        clear();
        const pendingReview = result.data.kind === "post" && result.data.status === "pending";
        toast(pendingReview ? "Sent for review. A moderator will check it, usually within a day." : mode.kind === "reply" ? "Reply posted" : "Posted");
        onPosted?.(result.data);
      } catch (error) {
        await removeMedia(uploaded.map((file) => file.path));
        toast.error(error instanceof Error ? error.message : "Couldn't post. Try again.");
      }
    });
  }

  function clear() {
    setCardChoice(undefined);
    for (const image of images) URL.revokeObjectURL(image.preview);
    setBody("");
    setImages([]);
    setPoll(null);
    setSchedule(null);
  }

  function togglePreview(on: boolean) {
    setPreviewing(on);
    if (!on) requestAnimationFrame(() => textarea.current?.focus());
  }

  // Anywhere in the composer: ⌘/Ctrl+Shift+P switches to the preview, Esc comes back.
  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key.toLowerCase() === "p" && event.shiftKey && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      togglePreview(!previewing);
    } else if (event.key === "Escape" && previewing) {
      event.preventDefault();
      event.stopPropagation();
      togglePreview(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentions.handleKey(event)) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape" && onCancel) onCancel();
  }

  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
      onKeyDown={onFormKeyDown}
      className={cn("flex gap-3", mode.kind === "post" && "px-4 py-3 sm:px-6")}
    >
      {mode.kind === "post" ? <ProgressAvatar person={{ ...author, accountType: author.id === viewer.id ? "person" : "organisation" }} length={body.length} limit={LIMITS.postBody} /> : null}
      <div className="relative min-w-0 flex-1">
        {identities.length > 1 && mode.kind !== "quote" ? (
          <select
            aria-label="Post as"
            value={author.id}
            onChange={(event) => setAuthorId(event.target.value)}
            className="mb-1 max-w-full rounded-md bg-transparent py-0.5 text-sm font-medium text-primary hover:bg-wash"
          >
            {identities.map((identity) => (
              <option key={identity.id} value={identity.id}>
                {identity.id === viewer.id ? `Posting as you (@${identity.username})` : `Posting as ${identity.displayName}`}
              </option>
            ))}
          </select>
        ) : null}

        <textarea
          ref={textarea}
          value={body}
          rows={mode.kind === "post" ? 2 : 2}
          autoFocus={autoFocus}
          maxLength={LIMITS.postBody + 200}
          placeholder={placeholder(mode)}
          aria-label={PLACEHOLDERS[mode.kind]}
          onChange={(event) => {
            setBody(event.target.value);
            setPersonal([]);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSelect={mentions.onSelect}
          hidden={previewing}
          className={cn(
            "block w-full resize-none overflow-hidden bg-transparent text-[17px] leading-snug placeholder:text-ink-muted/80 focus:outline-none",
            mode.kind !== "post" && "rounded-md border border-rail px-3 py-2 focus:border-primary",
          )}
        />
        {previewing ? (
          <div tabIndex={-1} aria-label="Preview" className={cn("min-h-[2lh] text-[17px] leading-snug focus:outline-none", mode.kind !== "post" && "rounded-md border border-dashed border-rail px-3 py-2")}>
            {body.trim() ? <RichText body={body} /> : <p className="text-ink-muted">Nothing to preview yet.</p>}
            {card ? <p className="mt-2 font-mono text-xs text-ink-muted">Card for {displayUrl(card)}</p> : null}
          </div>
        ) : null}
        <MentionMenu state={mentions} />

        {images.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {images.map((image) => (
              <div key={image.key} className="relative overflow-hidden rounded-lg border border-hairline">
                <img src={image.preview} alt="" className="aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => {
                    URL.revokeObjectURL(image.preview);
                    setImages((current) => current.filter((item) => item.key !== image.key));
                  }}
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/70 p-1 text-white"
                >
                  <X className="size-4" />
                </button>
                <input
                  aria-label="Image description"
                  placeholder="Describe the image for people who can't see it"
                  maxLength={LIMITS.imageAlt}
                  value={image.alt}
                  onChange={(event) => setImages((current) => current.map((item) => (item.key === image.key ? { ...item, alt: event.target.value } : item)))}
                  className="w-full border-t border-hairline bg-surface px-2 py-1.5 text-sm focus:outline-none"
                />
              </div>
            ))}
          </div>
        ) : null}

        {poll ? <PollEditor poll={poll} onChange={setPoll} /> : null}

        {schedule ? <SchedulePicker value={schedule} onChange={setSchedule} now={now} problem={scheduleError} /> : null}

        {mode.kind !== "quote" && links.length > 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-rail px-3 py-2 text-sm text-ink-muted">
            {card ? <Link2 className="size-4 shrink-0" /> : <Link2Off className="size-4 shrink-0" />}
            <label className="min-w-0 flex-1">
              <span className="sr-only">Link card</span>
              <select
                value={card ?? ""}
                onChange={(event) => setCardChoice(event.target.value || null)}
                className="w-full truncate bg-transparent font-mono text-[13px] focus:outline-none"
              >
                {links.map((link) => (
                  <option key={link} value={link}>
                    Card for {displayUrl(link)}
                  </option>
                ))}
                <option value="">No link card</option>
              </select>
            </label>
          </div>
        ) : null}

        {mode.kind === "quote" ? (
          <div className="pointer-events-none">
            <QuotedBlock quoted={{ kind: "post", id: mode.quoted.id, body: mode.quoted.body, createdAt: mode.quoted.createdAt, author: mode.quoted.author, image: mode.quoted.images[0] ?? null }} />
          </div>
        ) : null}

        {personal.length > 0 ? (
          <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md bg-wash px-3 py-2 text-sm">
            <span>{personalInfoWarning(personal)}</span>
            <span className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPersonal([]);
                  togglePreview(false);
                }}
              >
                Edit
              </Button>
              <Button size="sm" onClick={() => submit({ checked: true })}>
                Post anyway
              </Button>
            </span>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {mode.kind !== "quote" ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={(event) => {
                    if (event.target.files) void addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <Button variant="ghost" size="icon" aria-label="Add images" title="Add images" disabled={images.length >= LIMITS.images || poll !== null} onClick={() => fileInput.current?.click()}>
                  <ImagePlus className="text-primary" />
                </Button>
              </>
            ) : null}
            {mode.kind === "post" ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={poll ? "Remove poll" : "Add a poll"}
                title={poll ? "Remove poll" : "Add a poll"}
                aria-pressed={poll !== null}
                disabled={images.length > 0}
                onClick={() => setPoll(poll ? null : { options: ["", ""], durationHours: 24 })}
              >
                <BarChart3 className="text-primary" />
              </Button>
            ) : null}
            {schedulable ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={schedule ? "Don't schedule" : "Schedule for later"}
                title={schedule ? "Don't schedule" : "Schedule for later"}
                aria-pressed={schedule !== null}
                onClick={() => setSchedule(schedule ? null : initialSchedule(new Date()))}
              >
                <CalendarClock className="text-primary" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={previewing ? "Back to editing" : "Preview"}
              title={previewing ? "Edit (Esc)" : "Preview (⌘/Ctrl+Shift+P)"}
              aria-pressed={previewing}
              onClick={() => togglePreview(!previewing)}
            >
              {previewing ? <PenLine className="text-primary" /> : <Eye className="text-primary" />}
            </Button>
            <select aria-label="Language of this post" value={language} onChange={(event) => setLanguage(event.target.value)} className="h-8 max-w-36 rounded-md bg-transparent px-1 text-sm text-ink-muted hover:bg-wash">
              {LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
            <span className="ml-auto flex items-center gap-3">
              {restored ? (
                <span className="font-mono text-xs text-ink-muted">
                  draft restored ·{" "}
                  <button
                    type="button"
                    className="hover:text-ink"
                    onClick={() => setBody("")}
                  >
                    discard
                  </button>
                </span>
              ) : null}
              <span className={cn("w-10 text-right font-mono text-[13px] tabular", remaining < 0 ? "text-destructive" : remaining < 200 ? "text-ink" : "text-ink-muted/60")}>
                {remaining < 500 ? remaining : ""}
              </span>
              {onCancel ? (
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" size="sm" disabled={!canSubmit} className={schedule ? "min-w-[7.5rem]" : "min-w-[5.75rem]"} title="⌘/Ctrl + Enter">
                {schedule ? (pending ? "Scheduling…" : "Schedule post") : pending ? "Posting…" : mode.kind === "reply" ? "Reply" : mode.kind === "quote" ? "Quote" : "Post"}
              </Button>
            </span>
          </div>
        )}
      </div>
    </form>
  );
}

function PollEditor({ poll, onChange }: { poll: PollDraft; onChange: (poll: PollDraft | null) => void }) {
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-hairline p-3">
      {poll.options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={option}
            maxLength={LIMITS.pollOption}
            placeholder={`Option ${index + 1}${index > 1 ? " (optional)" : ""}`}
            onChange={(event) => onChange({ ...poll, options: poll.options.map((item, i) => (i === index ? event.target.value : item)) })}
            className="h-9 w-full rounded-md border border-rail bg-surface px-3 text-[15px] focus:border-primary focus:outline-none"
          />
          {index > 1 ? (
            <button type="button" aria-label="Remove option" className="rounded-md p-1.5 text-ink-muted hover:bg-wash" onClick={() => onChange({ ...poll, options: poll.options.filter((_, i) => i !== index) })}>
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        {poll.options.length < 4 ? (
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => onChange({ ...poll, options: [...poll.options, ""] })}>
            Add an option
          </button>
        ) : (
          <span />
        )}
        <select
          aria-label="Poll length"
          value={poll.durationHours}
          onChange={(event) => onChange({ ...poll, durationHours: POLL_DURATIONS.find((d) => String(d.hours) === event.target.value)?.hours ?? 24 })}
          className="h-8 rounded-md border border-rail bg-surface px-2 text-sm"
        >
          {POLL_DURATIONS.map((duration) => (
            <option key={duration.hours} value={duration.hours}>
              {duration.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
