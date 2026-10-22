import * as Haptics from "expo-haptics";

// Named by what the tap means rather than how strong it feels, as Bluesky's
// are, so the same kind of action feels the same everywhere. A phone without
// a Taptic Engine says no, and nothing is lost by ignoring it. The Switch has
// no call here: iOS already plays one for it.
const ignore = () => undefined;

export const haptics = {
  // A small control used often: like, save, the wordmark.
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(ignore),
  // A choice about someone or somewhere: follow, join, a long press.
  confirm: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(ignore),
  // Moving between options: segmented controls and pills.
  selection: () => void Haptics.selectionAsync().catch(ignore),
};
