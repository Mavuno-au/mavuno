import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { MONTHS } from "@/lib/age";
import { ActionSheet } from "@/ui/sheet";
import { Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";

export type BirthDate = { day: string; month: string; year: string };

// Three fields instead of a date wheel: a wheel starts on a preset date,
// which nudges people towards an age, and is slow for years far back. Day
// and year open the number pad; the month is a menu. The boxes are sized for
// their digits, so large text grows only so far in them.
export function BirthDateFields({ value, onChange, invalid }: { value: BirthDate; onChange: (value: BirthDate) => void; invalid: boolean }) {
  const palette = usePalette();
  const [choosing, setChoosing] = useState(false);
  const month = MONTHS[Number(value.month) - 1];
  const box = { minHeight: 52, borderRadius: 12, borderWidth: invalid ? 2 : 1, borderColor: invalid ? palette.destructive : palette.rail, paddingHorizontal: 14, justifyContent: "center" as const, backgroundColor: palette.surface };
  const label = (text: string) => (
    <Text variant="label" style={{ fontSize: 14 }}>
      {text}
    </Text>
  );
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ width: 80, gap: 6 }}>
        {label("Day")}
        <TextInput
          accessibilityLabel="Day you were born"
          value={value.day}
          onChangeText={(day) => onChange({ ...value, day: day.replace(/\D/g, "").slice(0, 2) })}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="DD"
          placeholderTextColor={palette.inkMuted}
          maxFontSizeMultiplier={1.6}
          style={[type.body, box, { color: palette.ink, fontSize: 18 }]}
        />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        {label("Month")}
        <Pressable accessibilityRole="button" accessibilityLabel={`Month you were born${month ? `, ${month}` : ""}`} onPress={() => setChoosing(true)} style={box}>
          <Text variant="body" tone={month ? "ink" : "muted"} maxFontSizeMultiplier={1.6} numberOfLines={1} style={{ fontSize: 18 }}>
            {month ?? "Choose"}
          </Text>
        </Pressable>
      </View>
      <View style={{ width: 100, gap: 6 }}>
        {label("Year")}
        <TextInput
          accessibilityLabel="Year you were born"
          value={value.year}
          onChangeText={(year) => onChange({ ...value, year: year.replace(/\D/g, "").slice(0, 4) })}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="YYYY"
          placeholderTextColor={palette.inkMuted}
          maxFontSizeMultiplier={1.6}
          style={[type.body, box, { color: palette.ink, fontSize: 18 }]}
        />
      </View>
      <ActionSheet
        title="Month"
        open={choosing}
        onClose={() => setChoosing(false)}
        actions={MONTHS.map((name, index) => ({ label: name, checked: Number(value.month) === index + 1, onPress: () => onChange({ ...value, month: String(index + 1) }) }))}
      />
    </View>
  );
}
