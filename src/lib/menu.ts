// What a key pressed inside an open menu does, as the ARIA menu pattern asks:
// arrows wrap, Home and End jump, Escape closes back to the trigger and Tab
// just closes so focus carries on past the menu.
export type MenuKeyAction = { kind: "focus"; index: number } | { kind: "close"; refocus: boolean } | { kind: "none" };

export function menuKeyAction(key: string, index: number, count: number): MenuKeyAction {
  const focus = (to: number): MenuKeyAction => ({ kind: "focus", index: ((to % count) + count) % count });
  switch (key) {
    case "ArrowDown":
      return focus(index + 1);
    case "ArrowUp":
      return focus(index < 0 ? count - 1 : index - 1);
    case "Home":
      return focus(0);
    case "End":
      return focus(count - 1);
    case "Escape":
      return { kind: "close", refocus: true };
    case "Tab":
      return { kind: "close", refocus: false };
    default:
      return { kind: "none" };
  }
}
