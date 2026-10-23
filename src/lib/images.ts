import "server-only";
import sharp from "sharp";

const FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
const MAX_EDGE = 6000;
// Wide enough for any screen; the height leaves room for long screenshots.
const MAX_HEIGHT = 4800;

export type Encoded = { data: Buffer; width: number; height: number };

// Decodes the image and encodes only its pixels as WebP. Sharp writes no
// metadata unless asked, so EXIF, XMP and the location a phone camera records
// are left behind whatever the upload carried. Returns null for anything that
// isn't a JPEG, PNG, WebP or GIF; an animated one keeps its first frame, as
// the composer tells the person.
export async function reencode(input: ArrayBuffer, maxWidth: number): Promise<Encoded | null> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_EDGE * MAX_EDGE, autoOrient: true });
    const { format, width, height } = await image.metadata();
    if (!FORMATS.has(format) || width > MAX_EDGE || height > MAX_EDGE) return null;
    const { data, info } = await image
      .resize({ width: maxWidth, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
