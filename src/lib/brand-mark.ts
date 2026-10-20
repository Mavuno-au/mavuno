// The Mavuno mark, a shoot growing from its seed, on a 512-unit grid. The in-app
// logo (src/components/shell/brand.tsx) and the downloadable files
// (scripts/brand-assets.mjs) are both drawn from this one definition.

const LEAF_LENGTH = 186;
const LEAF_TOP = 40;
const LEAF_BELLY = 104;
const LEAF_ANGLE = 48;
const BASE = { x: 256, y: 226 } as const;

// A leaf from its base (0,0) to its tip (L,0), fuller underneath.
const leaf = `M0 0C${LEAF_LENGTH * 0.22} ${-LEAF_TOP} ${LEAF_LENGTH * 0.78} ${-LEAF_TOP * 0.92} ${LEAF_LENGTH} 0C${LEAF_LENGTH * 0.72} ${LEAF_BELLY} ${LEAF_LENGTH * 0.24} ${LEAF_BELLY * 1.05} 0 0Z`;

export const MARK = {
  viewBox: "0 0 512 512",
  // The drawn area inside the viewBox, for cropping and placing the mark.
  bounds: { x: 117.4, y: 87.8, width: 277.3, height: 344.3 },
  stem: { x: 236, y: 216, width: 40, height: 164, rx: 20 },
  leaves: [
    { d: leaf, transform: `translate(${BASE.x} ${BASE.y}) scale(-1 1) rotate(${-LEAF_ANGLE})` },
    { d: leaf, transform: `translate(${BASE.x} ${BASE.y}) rotate(${-LEAF_ANGLE})` },
  ],
  seed: { cx: 256, cy: 392, r: 40 },
} as const;

export const BRAND_COLOURS = {
  light: { leaf: "#12704f", seed: "#b7791f", ink: "#1b1a17", ground: "#f6f4ef", muted: "#67625a" },
  dark: { leaf: "#5cc497", seed: "#f2c24f", ink: "#ece8e1", ground: "#121110", muted: "#a39d92" },
} as const;

// The mark's shapes as SVG markup, coloured, for files and image generation.
export function markShapes(colours: { leaf: string; seed: string }) {
  const { stem, leaves, seed } = MARK;
  return [
    `<g fill="${colours.leaf}">`,
    `<rect x="${stem.x}" y="${stem.y}" width="${stem.width}" height="${stem.height}" rx="${stem.rx}"/>`,
    ...leaves.map((shape) => `<path transform="${shape.transform}" d="${shape.d}"/>`),
    "</g>",
    `<circle cx="${seed.cx}" cy="${seed.cy}" r="${seed.r}" fill="${colours.seed}"/>`,
  ].join("");
}
