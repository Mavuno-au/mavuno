import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import sharp from "sharp";
import { BRAND_COLOURS, MARK, markShapes } from "@/lib/brand-mark";
import type { Colour } from "@/lib/domain";
import { publicEnv } from "@/lib/env";
import { DISPLAY_TIME_ZONE } from "@/lib/format";

// Share images (Open Graph and X cards) for posts, profiles, spaces and
// events, drawn with the brand's type and colours.

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const [regular, semibold, bold, mono] = await Promise.all([font("Geist-Regular.ttf"), font("Geist-SemiBold.ttf"), font("Geist-Bold.ttf"), font("GeistMono-Regular.ttf")]);

export const INK = BRAND_COLOURS.light;
// The light identity colours, as in --colour-0 … --colour-5 in globals.css.
const IDENTITY = ["#c2410c", "#b7791f", "#8e3fb5", "#0e7c86", "#c0265a", "#4257c8"] as const;
export const identity = (colour: Colour) => IDENTITY[colour] ?? IDENTITY[0];

const svgData = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const markSvg = (colours: { leaf: string; seed: string }) =>
  svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.bounds.x} ${MARK.bounds.y} ${MARK.bounds.width} ${MARK.bounds.height}">${markShapes(colours)}</svg>`);
const MARK_LIGHT = markSvg(INK);
const MARK_ON_PHOTO = markSvg({ leaf: "#ffffff", seed: BRAND_COLOURS.dark.seed });

// Only our own storage, Google profile photos and the Wikimedia city photos
// in the reference data are fetched, so a profile or post can never make the
// server request an arbitrary address.
const storagePrefix = `${new URL(publicEnv.supabaseUrl).origin}/storage/v1/object/public/`;
const allowedImage = (url: string) =>
  url.startsWith(storagePrefix) || /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url) || /^https:\/\/lh\d\.googleusercontent\.com\//.test(url);

export const SITE_HOST = new URL(publicEnv.siteUrl).host;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Uploads are WebP, which the renderer can't read; convert to a JPEG sized for the card.
export async function cardImage(url: string | null, width: number, height = width): Promise<string | null> {
  if (!url || !allowedImage(url)) return null;
  try {
    // Wikimedia asks automated clients to say who they are.
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "error", headers: { "User-Agent": `Mavuno share images (${publicEnv.siteUrl})` } });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    const jpeg = await sharp(bytes).resize(width * 2, height * 2, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: DISPLAY_TIME_ZONE });

// Cuts text to a length at a word boundary.
export function clip(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function render(node: ReactElement) {
  return new ImageResponse(node, {
    ...OG_SIZE,
    fonts: [
      { name: "Geist", data: regular, weight: 400, style: "normal" },
      { name: "Geist", data: semibold, weight: 600, style: "normal" },
      { name: "Geist", data: bold, weight: 700, style: "normal" },
      { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
    ],
    // Posts and profiles change; previews refresh within the hour.
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

export function Wordmark({ onPhoto = false, size = 34 }: { onPhoto?: boolean; size?: number }) {
  const markHeight = size * 1.15;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
      <img src={onPhoto ? MARK_ON_PHOTO : MARK_LIGHT} height={markHeight} width={markHeight * (MARK.bounds.width / MARK.bounds.height)} alt="" />
      <span style={{ fontSize: size, fontWeight: 700, letterSpacing: -0.8, color: onPhoto ? "#ffffff" : INK.ink }}>mavuno</span>
    </div>
  );
}

// The sand page with an identity-coloured edge, content on top and a footer
// with the wordmark and a mono note.
export function Frame({ accent, note, children }: { accent: string; note: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: INK.ground, fontFamily: "Geist", color: INK.ink }}>
      <div style={{ display: "flex", width: 14, height: "100%", background: accent }} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "60px 72px 48px 64px" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>{children}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #e4e0d7", paddingTop: 28 }}>
          <Wordmark />
          <span style={{ fontFamily: "Geist Mono", fontSize: 24, color: INK.muted }}>{note}</span>
        </div>
      </div>
    </div>
  );
}

// A round photo with the person's colour around it, or their initial.
export function CardAvatar({ src, name, colour, size, organisation = false }: { src: string | null; name: string; colour: Colour; size: number; organisation?: boolean }) {
  const radius = organisation ? size * 0.28 : size / 2;
  const ring = Math.round(size * 0.05);
  return (
    <div style={{ display: "flex", padding: ring, borderRadius: radius + ring * 2, border: `${ring}px solid ${identity(colour)}` }}>
      {src ? (
        <img src={src} width={size} height={size} style={{ borderRadius: radius, objectFit: "cover" }} alt="" />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: radius, background: identity(colour), color: "#ffffff", fontSize: size * 0.42, fontWeight: 700 }}>
          {(name.trim()[0] ?? "?").toUpperCase()}
        </div>
      )}
    </div>
  );
}

// For anything that can't be shown to a guest: the plain brand card.
export function SiteCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: INK.ground, fontFamily: "Geist", gap: 36 }}>
      <Wordmark size={96} />
      <span style={{ fontSize: 36, color: INK.muted }}>The social network for African Australians</span>
    </div>
  );
}

export function PhotoBackdrop({ src }: { src: string }) {
  return (
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: OG_SIZE.width, height: OG_SIZE.height }}>
      <img src={src} width={OG_SIZE.width} height={OG_SIZE.height} style={{ objectFit: "cover" }} alt="" />
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          backgroundImage: "linear-gradient(90deg, rgba(10,9,8,0.88) 0%, rgba(10,9,8,0.66) 50%, rgba(10,9,8,0.3) 100%)",
        }}
      />
    </div>
  );
}
