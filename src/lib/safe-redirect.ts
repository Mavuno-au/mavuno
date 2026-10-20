// Only same-site paths are followed after sign-in, never another origin.
// Browsers drop tabs and newlines and read backslashes as slashes, so
// "/\t/evil.example" would leave the site; anything like that is refused.
export function safeNext(value: unknown, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || /[\x00-\x20\\]/.test(value)) return fallback;
  return new URL(value, "http://mavuno.invalid").origin === "http://mavuno.invalid" ? value : fallback;
}

// Most people who try to like, reply or follow while signed out are new, so
// they are offered an account first; both pages link to each other and keep
// where they were.
export const joinPath = (next: string) => (next === "/" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`);
export const signInPath = (next: string) => (next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
export const onboardingPath = (next: string) => (next === "/" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(next)}`);
export const ageCheckPath = (next: string) => (next === "/" ? "/onboarding/age" : `/onboarding/age?next=${encodeURIComponent(next)}`);
