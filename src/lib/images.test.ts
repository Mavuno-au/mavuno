import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { reencode } = await import("./images");

const toArrayBuffer = (buffer: Buffer) => new Uint8Array(buffer).buffer;

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#c8553d" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Make: "Phone" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "27/1 28/1 0/1" } })
    .toBuffer();

describe("reencode", () => {
  it("drops EXIF and location data", async () => {
    const input = await photo(400, 300);
    expect(input.includes(Buffer.from("Phone"))).toBe(true);
    const output = await reencode(toArrayBuffer(input), 1600);
    if (!output) throw new Error("expected an image");
    const metadata = await sharp(output.data).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(output.data.includes(Buffer.from("Phone"))).toBe(false);
  });

  it("turns the picture upright before the orientation is dropped", async () => {
    const output = await reencode(toArrayBuffer(await photo(400, 300)), 1600);
    expect(output && [output.width, output.height]).toEqual([300, 400]);
  });

  it("scales down to the width asked for and never up", async () => {
    const input = toArrayBuffer(await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#fff" } }).png().toBuffer());
    expect(await reencode(input, 1600)).toMatchObject({ width: 1600, height: 800 });
    expect(await reencode(input, 4000)).toMatchObject({ width: 2000, height: 1000 });
  });

  it("refuses what isn't an image", async () => {
    expect(await reencode(toArrayBuffer(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), 1600)).toBeNull();
    expect(await reencode(toArrayBuffer(Buffer.from("not an image")), 1600)).toBeNull();
  });
});
