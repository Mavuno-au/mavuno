import { z } from "zod";
import { getBrowserClient } from "@/lib/supabase/browser";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 6000;

export type PreparedImage = { blob: Blob; width: number; height: number; preview: string };

// Re-encodes an image to WebP at most `maxWidth` wide, for the preview and a
// small upload. The server encodes it again, which is what strips metadata.
export async function prepareImage(file: File, maxWidth = 1600): Promise<PreparedImage> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("Use a JPEG, PNG, WebP or GIF image.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Images can be up to 10 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width > MAX_EDGE || bitmap.height > MAX_EDGE) throw new Error("Images can be up to 6,000 pixels on a side.");

  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not process this image.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("Your browser could not process this image.");
  return { blob, width, height, preview: URL.createObjectURL(blob) };
}

const uploadedSchema = z.object({ path: z.string(), width: z.number().int().positive(), height: z.number().int().positive() });
const errorSchema = z.object({ error: z.string() });

type Target = { bucket: "media"; folder: "posts" | "avatars" | "banners" | "events"; ownerId: string } | { bucket: "message-media"; conversationId: string };

// Photos go through the server, which stores them without metadata.
async function upload(target: Target, blob: Blob) {
  const form = new FormData();
  for (const [key, value] of Object.entries(target)) form.set(key, value);
  form.set("file", blob);
  const response = await fetch("/api/upload", { method: "POST", body: form }).catch(() => null);
  const body: unknown = await response?.json().catch(() => null);
  const uploaded = uploadedSchema.safeParse(body);
  if (response?.ok && uploaded.success) return uploaded.data;
  const problem = errorSchema.safeParse(body);
  throw new Error(problem.success ? problem.data.error : "The upload failed. Try again.");
}

export type Uploaded = { path: string; url: string; width: number; height: number };

// Public images live under the folder of the profile they belong to.
export async function uploadMedia({ ownerId, kind, blob }: { ownerId: string; kind: "posts" | "avatars" | "banners" | "events"; blob: Blob }): Promise<Uploaded> {
  const uploaded = await upload({ bucket: "media", folder: kind, ownerId }, blob);
  return { ...uploaded, url: getBrowserClient().storage.from("media").getPublicUrl(uploaded.path).data.publicUrl };
}

// Removes uploads that never became part of a post, for example when posting failed.
export async function removeMedia(paths: string[]) {
  if (paths.length) await getBrowserClient().storage.from("media").remove(paths);
}

export async function uploadMessageImage({ conversationId, blob }: { conversationId: string; blob: Blob }) {
  return (await upload({ bucket: "message-media", conversationId }, blob)).path;
}
