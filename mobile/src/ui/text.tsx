import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from "@expo-google-fonts/geist";
import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { Text as NativeText, type TextProps, type TextStyle } from "react-native";
import { usePalette, type Palette } from "@/ui/theme";

// Geist for people's words, Geist Mono for what a machine prints (DESIGN.md).
// Loaded with useFonts rather than embedded, so Expo Go shows them too.
export const FONTS = { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular, GeistMono_500Medium };

export const font = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
} as const;

// The iPhone design's text styles; every size scales with the reader's text
// size setting (allowFontScaling is on by default).
export const type = {
  largeTitle: { fontFamily: font.bold, fontSize: 34, lineHeight: 41, letterSpacing: -0.8 },
  title: { fontFamily: font.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontFamily: font.bold, fontSize: 19, lineHeight: 24 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  focus: { fontFamily: font.regular, fontSize: 17, lineHeight: 25 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  name: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  callout: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
  subhead: { fontFamily: font.regular, fontSize: 14, lineHeight: 19 },
  meta: { fontFamily: font.mono, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.mono, fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

export type TypeStyle = keyof typeof type;
export type Tone = "ink" | "muted" | "primary" | "destructive" | "primaryInk";

const toneColour = (palette: Palette, tone: Tone) =>
  ({ ink: palette.ink, muted: palette.inkMuted, primary: palette.primary, destructive: palette.destructive, primaryInk: palette.primaryInk })[tone];

export function Text({ variant = "body", tone = "ink", style, ...props }: TextProps & { variant?: TypeStyle; tone?: Tone }) {
  const palette = usePalette();
  return <NativeText {...props} style={[type[variant], { color: toneColour(palette, tone) }, style]} />;
}
