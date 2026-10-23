import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { z } from "zod";
import { fail, ok, type Result } from "@/lib/result";
import { routeError, siteFetch } from "@/data/api";
import { RequestError } from "@/data/errors";

// A photo picked on the phone, not yet sent.
export type PickedImage = { key: string; uri: string; width: number; height: number; alt: string };

// The website sends photos at most 1,600 pixels wide; the server re-encodes
// them to WebP, which drops location and camera details.
const MAX_WIDTH = 1600;

let next = 0;

// The iOS photo picker needs no permission: it shows the library in its own process.
export async function pickImages(limit: number): Promise<PickedImage[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => ({ key: `picked-${++next}`, uri: asset.uri, width: asset.width, height: asset.height, alt: "" }));
}

async function shrink(image: PickedImage) {
  const context = ImageManipulator.manipulate(image.uri);
  if (image.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const rendered = await context.renderAsync();
  return rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 });
}

const uploaded = z.object({ path: z.string(), width: z.number().int().positive(), height: z.number().int().positive() });
type Uploaded = z.infer<typeof uploaded>;

export type Destination =
  | { bucket: "media"; folder: "posts" | "events" | "banners" | "avatars"; ownerId: string }
  | { bucket: "message-media"; conversationId: string };

// POST /api/upload. Its errors are sentences to show as they are.
export async function uploadImage(image: PickedImage, destination: Destination): Promise<Result<Uploaded>> {
  try {
    const file = await shrink(image);
    const form = new FormData();
    // Expo's fetch sends a part only when it can read its bytes, which
    // expo-file-system's File can; React Native's { uri, type, name } it can't.
    form.append("file", new File(file.uri), "photo.jpg");
    form.append("bucket", destination.bucket);
    if (destination.bucket === "media") {
      form.append("folder", destination.folder);
      form.append("ownerId", destination.ownerId);
    } else {
      form.append("conversationId", destination.conversationId);
    }
    const response = await siteFetch("/api/upload", { method: "POST", body: form });
    if (!response.ok) return fail(await routeError(response, "The upload failed. Try again."));
    return ok(uploaded.parse(await response.json()));
  } catch (error) {
    return fail(error instanceof RequestError && error.reason === "offline" ? "Couldn't reach Mavuno. Check your connection and try again." : "The upload failed. Try again.");
  }
}
