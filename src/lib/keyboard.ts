// Whether a phone's on-screen keyboard is up, from how much of the window the
// visual viewport covers. Once open it stays open until the room comes back:
// a field loses focus before the keyboard has gone, and a tap that blurs it
// would otherwise land on a bottom bar that reappeared under the finger.
export const KEYBOARD_MIN = 120;

export function isKeyboardOpen(wasOpen: boolean, typing: boolean, hiddenHeight: number): boolean {
  if (hiddenHeight <= KEYBOARD_MIN) return false;
  return wasOpen || typing;
}

// Inputs that raise a keyboard; checkboxes, buttons and sliders don't.
export function raisesKeyboard(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  return element instanceof HTMLInputElement && !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(element.type);
}
