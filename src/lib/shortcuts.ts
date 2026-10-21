// Single-key shortcuts (j, k, r, c, g h, ? and so on). They match the physical
// key, so an Arabic, Amharic or Cyrillic layout gets the same ones, and they
// can be turned off, as WCAG 2.1.4 asks of any character-key shortcut.

const STORAGE_KEY = "shortcuts";
const CHANGE = "mavuno:shortcuts";

// The letter or symbol a shortcut is written as, whatever the layout.
export function shortcutKey(event: { key: string; code: string; shiftKey: boolean }): string {
  const { key, code } = event;
  const latinOrNamed = key.length !== 1 || key.charCodeAt(0) < 128;
  if (latinOrNamed) return key;
  // The typed character isn't Latin: fall back to the position the key has on
  // a US layout, which is what the shortcut list names.
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (code === "Slash") return event.shiftKey ? "?" : "/";
  return key;
}

export function readShortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function applyShortcutsEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, "off");
  } catch {}
  window.dispatchEvent(new Event(CHANGE));
}

export function subscribeToShortcuts(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}
