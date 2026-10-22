// Draws every Mavuno logo file from the mark in src/lib/brand-mark.ts:
// SVGs (letters as outlines, so they look right without Geist installed),
// 4K PNGs, 4K wallpapers, the app and install icons, and the share image.
//
//   pnpm brand

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import opentype from "opentype.js";
import { BRAND_COLOURS, MARK, markShapes } from "../src/lib/brand-mark.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fonts = join(root, "node_modules/geist/dist/fonts/geist-sans");
const bold = opentype.loadSync(join(fonts, "Geist-Bold.ttf"));
const regular = opentype.loadSync(join(fonts, "Geist-Regular.ttf"));

const TAGLINE = "The social network for African Australians";
const { bounds } = MARK;
const round = (value) => Math.round(value * 100) / 100;

// The mark placed so its drawn area is `height` tall with its top-left at (x, y).
function placedMark(colours, { x, y, height }) {
  const scale = height / bounds.height;
  return `<g transform="translate(${round(x - bounds.x * scale)} ${round(y - bounds.y * scale)}) scale(${round(scale)})">${markShapes(colours)}</g>`;
}

// Text as a single outlined path.
function outlined(font, text, { x, baseline, size, fill, letterSpacing = 0 }) {
  return `<path fill="${fill}" d="${font.getPath(text, x, baseline, size, { letterSpacing }).toPathData(2)}"/>`;
}

// The wordmark: the mark beside "mavuno", the mark twice the x-height and
// centred on it, the way the in-app logo sits. Returns markup and its size.
function wordmark(colours, { x = 0, y = 0, size = 200 } = {}) {
  const letterSpacing = -0.025;
  const xHeight = (bold.tables.os2.sxHeight / bold.unitsPerEm) * size;
  const markHeight = xHeight * 2.05;
  const markWidth = markHeight * (bounds.width / bounds.height);
  const gap = markHeight * 0.26;
  const baseline = y + markHeight / 2 + xHeight / 2;
  const textX = x + markWidth + gap;
  const textWidth = bold.getAdvanceWidth("mavuno", size, { letterSpacing });
  return {
    width: markWidth + gap + textWidth,
    height: markHeight,
    markup:
      placedMark(colours, { x, y, height: markHeight }) +
      outlined(bold, "mavuno", { x: textX, baseline, size, fill: colours.ink, letterSpacing }),
  };
}

const svg = (width, height, body, label = "Mavuno") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}" role="img" aria-label="${label}">${body}</svg>\n`;

const png = (source, width) => new Resvg(source, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng();

function wordmarkFile(colours) {
  const margin = 24;
  const mark = wordmark(colours, { x: margin, y: margin });
  return svg(mark.width + margin * 2, mark.height + margin * 2, mark.markup);
}

function markFile(colours) {
  const size = 512;
  const height = size * 0.78;
  const width = height * (bounds.width / bounds.height);
  return svg(size, size, placedMark(colours, { x: (size - width) / 2, y: (size - height) / 2, height }));
}

// Rounded square for app stores and docks; `bleed` fills the whole square for
// Android's maskable icons, keeping the mark inside the safe circle. The
// favicon draws the mark larger so it still reads at 16px.
function appIcon({ bleed = false, markScale = bleed ? 0.5 : 0.62 } = {}) {
  const size = 512;
  const height = size * markScale;
  const width = height * (bounds.width / bounds.height);
  const background = bleed ? `<rect width="${size}" height="${size}" fill="${BRAND_COLOURS.light.leaf}"/>` : `<rect width="${size}" height="${size}" rx="${size * 0.225}" fill="${BRAND_COLOURS.light.leaf}"/>`;
  return svg(size, size, background + placedMark({ leaf: "#ffffff", seed: BRAND_COLOURS.dark.seed }, { x: (size - width) / 2, y: (size - height) / 2, height }));
}

// A calm background: the wordmark and tagline centred, a large faint mark
// rising from the lower right. `scale` enlarges the type for small previews.
function wallpaper(colours, width, height, { scale = 1 } = {}) {
  const mark = wordmark(colours, { size: height * 0.115 * scale });
  const tagSize = height * 0.03 * scale;
  const tagWidth = regular.getAdvanceWidth(TAGLINE, tagSize);
  const top = (height - mark.height) / 2 - tagSize;
  const left = (width - mark.width) / 2;
  const faintHeight = height * 1.1;
  return svg(
    width,
    height,
    `<rect width="${width}" height="${height}" fill="${colours.ground}"/>` +
      `<g opacity="0.06">${placedMark(colours, { x: width - faintHeight * 0.62, y: height * 0.32, height: faintHeight })}</g>` +
      `<g transform="translate(${round(left)} ${round(top)})">${mark.markup}</g>` +
      outlined(regular, TAGLINE, { x: (width - tagWidth) / 2, baseline: top + mark.height + tagSize * 2.6, size: tagSize, fill: colours.muted }),
    "Mavuno wallpaper",
  );
}

// The phone app's icon: the mark on sand, as the iPhone design has it. iOS
// rounds the corners itself and draws its own background behind the dark and
// tinted versions; Android's adaptive icon keeps the mark inside its safe zone.
function phoneIcon(colours, { ground = null, markScale = 0.58 } = {}) {
  const size = 1024;
  const height = size * markScale;
  const width = height * (bounds.width / bounds.height);
  const background = ground ? `<rect width="${size}" height="${size}" fill="${ground}"/>` : "";
  return svg(size, size, background + placedMark(colours, { x: (size - width) / 2, y: (size - height) / 2, height }));
}

// The mark cropped to its drawn area for the launch screen, which shows it 64 points wide.
const launchMark = (colours) => png(svg(bounds.width, bounds.height, placedMark(colours, { x: 0, y: 0, height: bounds.height })), 384);

const out = (path, data) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
  return path;
};

const { light, dark } = BRAND_COLOURS;
const written = [
  out("public/brand/mavuno-wordmark.svg", wordmarkFile(light)),
  out("public/brand/mavuno-wordmark-dark-background.svg", wordmarkFile(dark)),
  out("public/brand/mavuno-wordmark-4k.png", png(wordmarkFile(light), 3840)),
  out("public/brand/mavuno-wordmark-dark-background-4k.png", png(wordmarkFile(dark), 3840)),
  out("public/brand/mavuno-mark.svg", markFile(light)),
  out("public/brand/mavuno-mark-dark-background.svg", markFile(dark)),
  out("public/brand/mavuno-mark-4k.png", png(markFile(light), 2160)),
  out("public/brand/mavuno-mark-dark-background-4k.png", png(markFile(dark), 2160)),
  out("public/brand/mavuno-app-icon.svg", appIcon()),
  out("public/brand/mavuno-app-icon-4096.png", png(appIcon(), 4096)),
  out("public/brand/mavuno-wallpaper-light-4k.png", png(wallpaper(light, 3840, 2160), 3840)),
  out("public/brand/mavuno-wallpaper-dark-4k.png", png(wallpaper(dark, 3840, 2160), 3840)),
  out("src/app/icon.svg", appIcon({ markScale: 0.72 })),
  out("src/app/apple-icon.png", png(appIcon({ bleed: true }), 180)),
  out("public/icon-192.png", png(appIcon(), 192)),
  out("public/icon-512.png", png(appIcon(), 512)),
  out("public/icon-maskable-512.png", png(appIcon({ bleed: true }), 512)),
  out("src/app/opengraph-image.png", png(wallpaper(light, 1200, 630, { scale: 1.45 }), 1200)),
  // Email clients don't show SVG; the sign-in emails use this at half size.
  out("public/brand/mavuno-email-wordmark.png", png(wordmarkFile(light), 360)),
  out("mobile/assets/icon.png", png(phoneIcon(light, { ground: light.ground }), 1024)),
  out("mobile/assets/icon-dark.png", png(phoneIcon(dark), 1024)),
  out("mobile/assets/icon-tinted.png", png(phoneIcon({ leaf: "#d9d9d9", seed: "#9a9a9a" }), 1024)),
  out("mobile/assets/android-icon-foreground.png", png(phoneIcon(light, { markScale: 0.4 }), 1024)),
  out("mobile/assets/android-icon-monochrome.png", png(phoneIcon({ leaf: "#ffffff", seed: "#ffffff" }, { markScale: 0.4 }), 1024)),
  out("mobile/assets/splash.png", launchMark(light)),
  out("mobile/assets/splash-dark.png", launchMark(dark)),
];

console.log(written.join("\n"));
