import { Image } from "expo-image";
import { Text as NativeText, View } from "react-native";
import type { AccountType, Colour } from "@/lib/domain";
import { initials } from "@/lib/text";
import { font } from "@/ui/text";
import { identityColour, usePalette } from "@/ui/theme";

type Person = { displayName: string; avatarUrl: string | null; colour: Colour; accountType?: AccountType };

// Organisations get rounded squares so they read differently from people at a
// glance. Decorative: the name beside it says who it is.
export function Avatar({ person, size, ring = false }: { person: Person; size: number; ring?: boolean }) {
  const palette = usePalette();
  const colour = identityColour(palette, person.colour);
  const radius = person.accountType === "organisation" ? size * 0.28 : size / 2;
  const shape = { width: size, height: size, borderRadius: radius };
  const face = person.avatarUrl ? (
    <Image source={person.avatarUrl} style={[shape, { backgroundColor: palette.wash }]} contentFit="cover" transition={120} accessible={false} />
  ) : (
    <View style={[shape, { backgroundColor: colour, alignItems: "center", justifyContent: "center" }]}>
      {/* Initials stay the avatar's size whatever the text size: they are a picture, not text to read. */}
      <NativeText allowFontScaling={false} style={{ fontFamily: font.semibold, fontSize: size * 0.36, color: palette.onColour }}>
        {initials(person.displayName)}
      </NativeText>
    </View>
  );
  if (!ring) return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{face}</View>;
  // The identity colour as a ring with a gap of surface, as on the website.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ padding: 3, borderRadius: radius + 5, borderWidth: 2, borderColor: colour, backgroundColor: palette.surface, alignSelf: "flex-start" }}
    >
      {face}
    </View>
  );
}

// The dot before a handle: a person's identity colour, nowhere else.
export function ColourDot({ colour, size = 6 }: { colour: Colour; size?: number }) {
  const palette = usePalette();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: identityColour(palette, colour) }} />;
}
