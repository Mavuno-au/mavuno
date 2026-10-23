import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { initialSchedule, localDate, MAX_SCHEDULE_DAYS, MINUTE_STEP, scheduledDate, scheduleProblem } from "@/lib/schedule";
import { Button } from "@/ui/controls";
import { FieldError, SheetHeader } from "@/ui/form";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// The schedule rules from src/lib/schedule.ts, on a Date the picker gives.
const draftOf = (when: Date) => ({ date: localDate(when), hour: when.getHours(), minute: when.getMinutes() });
export const problemWith = (when: Date, now = new Date()) => scheduleProblem(draftOf(when), now);

// Posts can be scheduled in 5-minute steps, up to 30 days ahead, in the
// phone's own time zone. Opens on the top of the next hour.
export function ScheduleSheet({ open, value, onDone, onClear, onClose }: { open: boolean; value: Date | null; onDone: (when: Date) => void; onClear: () => void; onClose: () => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<Date | null>(null);
  const now = new Date();
  const shown = picked ?? value ?? scheduledDate(initialSchedule(now));
  const problem = problemWith(shown, now);
  const close = () => {
    setPicked(null);
    onClose();
  };

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: palette.surface, paddingBottom: insets.bottom + 16 }}>
        <SheetHeader
          title="Schedule post"
          onCancel={close}
          action={{
            label: "Done",
            disabled: problem !== null,
            onPress: () => {
              onDone(shown);
              close();
            },
          }}
        />
        <View style={{ padding: 16, gap: 12, alignItems: "center" }}>
          <DateTimePicker
            value={shown}
            mode="datetime"
            display="inline"
            minuteInterval={MINUTE_STEP}
            minimumDate={now}
            maximumDate={new Date(now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000)}
            accentColor={palette.primary}
            themeVariant={palette.dark ? "dark" : "light"}
            onChange={(_, date) => {
              if (date) setPicked(date);
            }}
          />
          {problem ? <FieldError>{problem}</FieldError> : null}
          <Text variant="small" tone="muted" style={{ textAlign: "center" }}>
            Only you can see a scheduled post until it goes out. Up to 10 at once, up to {MAX_SCHEDULE_DAYS} days ahead.
          </Text>
          {value ? (
            <Button
              label="Post now instead"
              variant="outline"
              size="medium"
              onPress={() => {
                onClear();
                close();
              }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
