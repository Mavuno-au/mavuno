import { router } from "expo-router";

// The photos the viewer shows. Image addresses are too long for a route's
// parameters, so the screen that opens them leaves them here.
export type ViewedPhoto = { url: string; alt: string; width: number | null; height: number | null };

let shown: { photos: ViewedPhoto[]; index: number } = { photos: [], index: 0 };

export function openPhotos(photos: readonly { url: string; alt: string; width?: number | null; height?: number | null }[], index: number) {
  shown = { photos: photos.map((photo) => ({ url: photo.url, alt: photo.alt, width: photo.width ?? null, height: photo.height ?? null })), index };
  router.push("/photos");
}

export const viewedPhotos = () => shown;
