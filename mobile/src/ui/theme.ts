import { useColorScheme, useWindowDimensions } from "react-native";
import type { Colour } from "@/lib/domain";

// The website's tokens (src/app/globals.css and DESIGN.md). CSS can't be
// imported, so a change there is made here too.
const light = {
  dark: false,
  shell: "#f6f4ef",
  surface: "#ffffff",
  popover: "#ffffff",
  ink: "#1b1a17",
  inkMuted: "#67625a",
  hairline: "#e6e1d8",
  rail: "#d6d0c4",
  wash: "#f0ece4",
  primary: "#12704f",
  primarySoft: "#e2f0ea",
  primaryInk: "#ffffff",
  destructive: "#c2341b",
  destructiveSoft: "#fbe9e5",
  // colour-1 at 18% on surface, as the website's warning chip mixes it.
  warning: "#f2e7d7",
  seed: "#b7791f",
  // Text on an identity colour (initials on an avatar).
  onColour: "#ffffff",
  colours: ["#c2410c", "#b7791f", "#8e3fb5", "#0e7c86", "#c0265a", "#4257c8"],
};

const dark: typeof light = {
  dark: true,
  shell: "#121110",
  surface: "#1a1917",
  popover: "#22201d",
  ink: "#ece8e1",
  inkMuted: "#a39d92",
  hairline: "#2c2a26",
  rail: "#3a3732",
  wash: "#24221f",
  primary: "#5cc497",
  primarySoft: "#15302a",
  primaryInk: "#0d1a14",
  destructive: "#ff6b57",
  destructiveSoft: "#3a1c17",
  warning: "#413721",
  seed: "#f2c24f",
  onColour: "#1b1a17",
  colours: ["#fb8a50", "#f2c24f", "#c88bea", "#3cc8d3", "#f26b98", "#8b9bf5"],
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const identityColour = (palette: Palette, colour: Colour) => palette.colours[colour] ?? palette.primary;

// Past the largest standard text size the rows stack, as the large-text design does.
export function useLargeText() {
  return useWindowDimensions().fontScale >= 1.4;
}
