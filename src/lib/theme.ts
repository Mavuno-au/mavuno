export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "theme";
const CHANGE = "mavuno:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// The root layout runs the same rule inline before first paint.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="dark"||(t!=="light"&&matchMedia("${DARK_QUERY}").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function paint(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  paint(theme);
  window.dispatchEvent(new Event(CHANGE));
}

// Notifies on a choice made in this tab or another, and repaints when the
// device switches between light and dark while "system" is chosen.
export function subscribeToTheme(onChange: () => void) {
  const media = matchMedia(DARK_QUERY);
  const onDeviceChange = () => {
    paint(readTheme());
    onChange();
  };
  window.addEventListener("storage", onDeviceChange);
  window.addEventListener(CHANGE, onChange);
  media.addEventListener("change", onDeviceChange);
  return () => {
    window.removeEventListener("storage", onDeviceChange);
    window.removeEventListener(CHANGE, onChange);
    media.removeEventListener("change", onDeviceChange);
  };
}
