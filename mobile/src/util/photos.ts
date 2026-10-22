import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { toast } from "@/ui/toast";

// The photos the viewer shows. Image addresses are too long for a route's
// parameters, so the screen that opens them leaves them here.
export type ViewedPhoto = { url: string; alt: string; width: number | null; height: number | null };

let shown: { photos: ViewedPhoto[]; index: number } = { photos: [], index: 0 };

export function openPhotos(photos: readonly { url: string; alt: string; width?: number | null; height?: number | null }[], index: number) {
  shown = { photos: photos.map((photo) => ({ url: photo.url, alt: photo.alt, width: photo.width ?? null, height: photo.height ?? null })), index };
  router.push("/photos");
}

export const viewedPhotos = () => shown;

// Shared as a file rather than a link, so the share sheet offers Save Image
// without the app asking for the photo library.
export async function sharePhoto(url: string) {
  try {
    const file = await File.downloadFileAsync(url, Paths.cache, { idempotent: true });
    await Sharing.shareAsync(file.uri, { dialogTitle: "Share photo" });
  } catch {
    toast("Couldn't get that photo. Check your connection, then try again.", { tone: "error" });
  }
}
