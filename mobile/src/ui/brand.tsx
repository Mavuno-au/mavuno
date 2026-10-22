import { View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { MARK } from "@/lib/brand-mark";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The shoot and seed, drawn from the website's one definition of the mark.
export function BrandMark({ height }: { height: number }) {
  const palette = usePalette();
  const { bounds, stem, leaves, seed } = MARK;
  return (
    <Svg width={(height * bounds.width) / bounds.height} height={height} viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} accessible={false}>
      <G fill={palette.primary}>
        <Rect x={stem.x} y={stem.y} width={stem.width} height={stem.height} rx={stem.rx} />
        {leaves.map((leaf) => (
          <Path key={leaf.transform} d={leaf.d} transform={leaf.transform} />
        ))}
      </G>
      <Circle cx={seed.cx} cy={seed.cy} r={seed.r} fill={palette.seed} />
    </Svg>
  );
}

export function Wordmark() {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Mavuno" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <BrandMark height={21} />
      <Text variant="heading" maxFontSizeMultiplier={1.4} style={{ letterSpacing: -0.4 }}>
        mavuno
      </Text>
    </View>
  );
}
