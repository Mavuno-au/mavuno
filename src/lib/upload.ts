import { getBrowserClient } from "@/lib/supabase/browser";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 6000;

export type PreparedImage = { blob: Blob; width: number; height: number; preview: string };

// Re-encodes an image to WebP at most `maxWidth` wide. Drawing it to a canvas
// drops EXIF data, including the location a phone camera records.
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

export type Uploaded = { path: string; url: string };

// Public images live under the folder of the profile they belong to.
export async function uploadMedia({ ownerId, kind, blob }: { ownerId: string; kind: "posts" | "avatars" | "banners" | "events"; blob: Blob }): Promise<Uploaded> {
  const supabase = getBrowserClient();
  const path = `${ownerId}/${kind}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from("media").upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
  if (error) throw new Error("The upload failed. Try again.");
  return { path, url: supabase.storage.from("media").getPublicUrl(path).data.publicUrl };
}

// Removes uploads that never became part of a post, for example when posting failed.
export async function removeMedia(paths: string[]) {
  if (paths.length) await getBrowserClient().storage.from("media").remove(paths);
}

export async function uploadMessageImage({ conversationId, blob }: { conversationId: string; blob: Blob }) {
  const supabase = getBrowserClient();
  const path = `${conversationId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from("message-media").upload(path, blob, { contentType: "image/webp" });
  if (error) throw new Error("The upload failed. Try again.");
  return path;
}
