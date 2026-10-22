import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import { createEvent } from "@/util/events";

// Whether the reader has asked the phone to reduce motion. Animations that
// move or bounce things skip themselves when so. One listener serves every
// row, rather than one per like button.
let reduced = false;
const changed = createEvent();

function set(value: boolean) {
  if (value === reduced) return;
  reduced = value;
  changed.emit();
}

void AccessibilityInfo.isReduceMotionEnabled().then(set, () => undefined);
AccessibilityInfo.addEventListener("reduceMotionChanged", set);

export const useReduceMotion = () => useSyncExternalStore(changed.on, () => reduced);
