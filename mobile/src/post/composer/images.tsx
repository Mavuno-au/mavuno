import { Image } from "expo-image";
import { Check, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { LIMITS } from "@/lib/catalogue";
import type { PickedImage } from "@/data/upload";
import { TextField } from "@/ui/form";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// Photos waiting to go up with a post or a message. Each asks for a
// description: ALT with a tick means described, + ALT means it still needs one.
// Tapping a photo opens its description field underneath.
export function ImageTray({
  images,
  active,
  onSelect,
  onRemove,
  onDescribe,
}: {
  images: PickedImage[];
  active: string | null;
  onSelect: (key: string) => void;
  onRemove: (key: string) => void;
  onDescribe: (key: string, alt: string) => void;
}) {
  const palette = usePalette();
  if (images.length === 0) return null;
  const current = images.find((image) => image.key === active);
  const index = current ? images.indexOf(current) : -1;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {images.map((image, position) => {
          const selected = image.key === active;
          return (
            <View key={image.key} style={{ width: images.length === 1 ? "100%" : "48.5%", aspectRatio: images.length === 1 ? Math.max(image.width / Math.max(image.height, 1), 0.8) : 1 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Photo ${position + 1}${image.alt ? `: ${image.alt}` : ", no description yet"}`}
                accessibilityHint="Edits its description"
                onPress={() => onSelect(image.key)}
                style={{ flex: 1, borderRadius: 16, overflow: "hidden", borderWidth: selected ? 3 : 0, borderColor: palette.primary, backgroundColor: palette.wash }}
              >
                <Image source={image.uri} style={{ flex: 1 }} contentFit="cover" accessible={false} />
                <View style={{ position: "absolute", left: 8, bottom: 8, flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 8, borderRadius: 6, backgroundColor: "rgba(0, 0, 0, 0.66)" }}>
                  {image.alt.trim() ? <Check size={12} color="#ffffff" strokeWidth={3} /> : null}
                  <Text allowFontScaling={false} style={{ fontFamily: font.semibold, fontSize: 12, color: "#ffffff", letterSpacing: 0.4 }}>
                    {image.alt.trim() ? "ALT" : "+ ALT"}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${position + 1}`}
                onPress={() => onRemove(image.key)}
                style={{ position: "absolute", right: 0, top: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0, 0, 0, 0.62)" }}>
                  <X size={14} color="#ffffff" strokeWidth={2.6} />
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
      {current ? (
        <TextField
          label={`Image description for photo ${index + 1}`}
          placeholder="Describe it for people who can't see it"
          value={current.alt}
          onChangeText={(alt) => onDescribe(current.key, alt)}
          limit={LIMITS.imageAlt}
          maxLength={LIMITS.imageAlt}
          multiline
        />
      ) : null}
    </View>
  );
}
