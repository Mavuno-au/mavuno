"use client";

import { ImagePlus, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ClipboardEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { sendMessage } from "@/app/actions/messages";
import { Button } from "@/components/ui/button";
import { draftPrefix } from "@/lib/browser-data";
import { LIMITS } from "@/lib/catalogue";
import { cn } from "@/lib/cn";
import type { Message } from "@/lib/data/messages";
import { prepareImage, uploadMessageImage, type PreparedImage } from "@/lib/upload";
import { useDraft } from "@/lib/use-draft";

type Attachment = PreparedImage & { key: string; alt: string };
export type ReplyTarget = { id: string; author: string; preview: string };

export function MessageComposer({
  viewerId,
  conversationId,
  replyTo,
  onCancelReply,
  onSent,
  onTyping,
}: {
  viewerId: string;
  conversationId: string;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  onSent: (message: Message) => void;
  onTyping: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { body, setBody } = useDraft(`${draftPrefix(viewerId)}message:${conversationId}`);
  const [images, setImages] = useState<Attachment[]>([]);
  const [pending, startTransition] = useTransition();
  const remaining = LIMITS.messageBody - body.length;
  const canSend = !pending && remaining >= 0 && (body.trim().length > 0 || images.length > 0);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [body]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  async function addFiles(files: File[]) {
    for (const file of files.slice(0, LIMITS.messageImages - images.length)) {
      try {
        const prepared = await prepareImage(file);
        setImages((current) => (current.length < LIMITS.messageImages ? [...current, { ...prepared, key: crypto.randomUUID(), alt: "" }] : current));
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

  function send() {
    if (!canSend) return;
    startTransition(async () => {
      try {
        const imagePaths = await Promise.all(images.map((image) => uploadMessageImage({ conversationId, blob: image.blob })));
        const result = await sendMessage({ conversationId, body, imagePaths, imageAlts: images.map((image) => image.alt), replyToId: replyTo?.id ?? null });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        for (const image of images) URL.revokeObjectURL(image.preview);
        setBody("");
        setImages([]);
        onCancelReply();
        onSent(result.data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't send. Try again.");
      }
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && replyTo) onCancelReply();
    // On touch keyboards Enter makes a new line; the send button sends.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    send();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="border-t border-hairline bg-surface px-3 py-2 sm:px-4"
    >
      {replyTo ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-wash px-3 py-1.5 text-[13px]">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink-muted">Replying to {replyTo.author}</p>
            <p className="truncate">{replyTo.preview}</p>
          </div>
          <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="-mr-1 rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {images.length > 0 ? (
        <ul className="mb-2 grid gap-2">
          {images.map((image, index) => (
            <li key={image.key} className="flex items-center gap-2">
              <img src={image.preview} alt="" className="size-14 shrink-0 rounded-lg border border-hairline object-cover" />
              <input
                aria-label={`Description for image ${index + 1}`}
                placeholder="Describe the image for people who can't see it"
                maxLength={LIMITS.imageAlt}
                value={image.alt}
                onChange={(event) => setImages((current) => current.map((item) => (item.key === image.key ? { ...item, alt: event.target.value } : item)))}
                className="min-w-0 flex-1 rounded-lg border border-rail bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                aria-label={`Remove image ${index + 1}`}
                onClick={() => {
                  URL.revokeObjectURL(image.preview);
                  setImages((current) => current.filter((item) => item.key !== image.key));
                }}
                className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-wash hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-1">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void addFiles(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
        <Button variant="ghost" size="icon" aria-label="Add images" title="Add up to 3 images" disabled={images.length >= LIMITS.messageImages || pending} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="text-primary" />
        </Button>
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={textarea}
            rows={1}
            value={body}
            maxLength={LIMITS.messageBody + 100}
            aria-label="Message"
            placeholder="Write a message"
            onChange={(event) => {
              setBody(event.target.value);
              onTyping();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            className="block max-h-40 w-full resize-none rounded-2xl border border-rail bg-surface px-3.5 py-2 text-[15px] leading-snug placeholder:text-ink-muted/80 focus:border-primary focus:outline-none"
          />
          {remaining < 200 ? (
            <span className={cn("pointer-events-none absolute right-3 -top-5 font-mono text-[11px] tabular", remaining < 0 ? "text-destructive" : "text-ink-muted")}>{remaining}</span>
          ) : null}
        </div>
        <Button type="submit" size="icon" aria-label="Send" title="Send (Enter)" disabled={!canSend} className="rounded-full">
          <SendHorizontal />
        </Button>
      </div>
    </form>
  );
}
