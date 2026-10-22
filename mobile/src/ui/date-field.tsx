import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/ui/controls";
import { SheetHeader } from "@/ui/form";
import { Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";

// A date (and time) chosen in a sheet, shown in the time zone it belongs to:
// an event's own zone, or Sydney for an opportunity's deadline.
export function DateField({
  label,
  value,
  onChange,
  mode = "datetime",
  timeZone,
  minimumDate,
  maximumDate,
  optional = false,
  placeholder = "Choose",
}: {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  mode?: "date" | "datetime";
  timeZone: string;
  minimumDate?: Date;
  maximumDate?: Date;
  optional?: boolean;
  placeholder?: string;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Date | null>(null);
  const shown = value
    ? value.toLocaleString("en-AU", mode === "date" ? { day: "numeric", month: "long", year: "numeric", timeZone } : { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone })
    : placeholder;
  const close = () => {
    setPicked(null);
    setOpen(false);
  };
  return (
    <>
      <View style={{ gap: 6 }}>
        <Text variant="label" style={{ fontSize: 14 }}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${shown}`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.rail, justifyContent: "center", backgroundColor: pressed ? palette.wash : palette.surface })}
        >
          <Text variant="body" tone={value ? "ink" : "muted"}>
            {shown}
          </Text>
        </Pressable>
      </View>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: palette.surface, paddingBottom: insets.bottom + 16 }}>
          <SheetHeader
            title={label}
            onCancel={close}
            action={{
              label: "Done",
              onPress: () => {
                onChange(picked ?? value ?? minimumDate ?? new Date());
                close();
              },
            }}
          />
          <View style={{ padding: 16, gap: 12, alignItems: "center" }}>
            <DateTimePicker
              value={picked ?? value ?? minimumDate ?? new Date()}
              mode={mode}
              display="inline"
              minuteInterval={5}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              timeZoneName={timeZone}
              accentColor={palette.primary}
              themeVariant={palette.dark ? "dark" : "light"}
              onChange={(_, date) => {
                if (date) setPicked(date);
              }}
            />
            {optional && value ? (
              <Button
                label="Clear"
                variant="outline"
                size="medium"
                onPress={() => {
                  onChange(null);
                  close();
                }}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
