import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { LIMITS, POLL_DURATIONS } from "@/lib/catalogue";
import { POLL_OPTIONS } from "@/lib/post-form";
import { ActionSheet } from "@/ui/sheet";
import { font, Text, type } from "@/ui/text";
import { usePalette } from "@/ui/theme";

export type PollHours = (typeof POLL_DURATIONS)[number]["hours"];
export type PollDraft = { options: string[]; durationHours: PollHours };

export const newPoll = (): PollDraft => ({ options: ["", ""], durationHours: 24 });

// Two options at least, four at most, 50 characters each; its length is one
// of the website's four choices.
export function PollEditor({ poll, onChange, onRemove }: { poll: PollDraft; onChange: (poll: PollDraft) => void; onRemove: () => void }) {
  const palette = usePalette();
  const [choosing, setChoosing] = useState(false);
  const duration = POLL_DURATIONS.find((option) => option.hours === poll.durationHours)?.label ?? "1 day";
  const setOption = (index: number, text: string) => onChange({ ...poll, options: poll.options.map((option, at) => (at === index ? text : option)) });
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.hairline }}>
      {poll.options.map((option, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TextInput
            accessibilityLabel={`Option ${index + 1}`}
            placeholder={`Option ${index + 1}${index >= POLL_OPTIONS.min ? " (optional)" : ""}`}
            placeholderTextColor={palette.inkMuted}
            value={option}
            onChangeText={(text) => setOption(index, text)}
            maxLength={LIMITS.pollOption}
            style={[type.body, { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.rail, color: palette.ink, fontSize: 16 }]}
          />
          {index >= POLL_OPTIONS.min ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove option ${index + 1}`} onPress={() => onChange({ ...poll, options: poll.options.filter((_, at) => at !== index) })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <X size={18} color={palette.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        {poll.options.length < POLL_OPTIONS.max ? (
          <Pressable accessibilityRole="button" onPress={() => onChange({ ...poll, options: [...poll.options, ""] })} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 }}>
            <Plus size={18} color={palette.primary} />
            <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
              Add an option
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`Poll length, ${duration}`} onPress={() => setChoosing(true)} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
            Ends after {duration}
          </Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={onRemove} style={{ alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }}>
        <Text variant="subhead" tone="destructive">
          Remove poll
        </Text>
      </Pressable>
      <ActionSheet
        title="Poll length"
        open={choosing}
        onClose={() => setChoosing(false)}
        actions={POLL_DURATIONS.map((option) => ({ label: option.label, checked: option.hours === poll.durationHours, onPress: () => onChange({ ...poll, durationHours: option.hours }) }))}
      />
    </View>
  );
}
