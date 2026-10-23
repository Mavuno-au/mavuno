import { describe, expect, it } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://mavuno.example";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const { emailLink } = await import("./email-link");
const { GET } = await import("@/app/.well-known/apple-app-site-association/route");

describe("emailLink", () => {
  it("marks links the website asks for, so they stay in the browser", () => {
    const link = new URL(`${emailLink("/onboarding?next=/events/1")}&token_hash=abc&type=email`);
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("via")).toBe("web");
    expect(link.searchParams.get("next")).toBe("/onboarding?next=/events/1");
  });
});

describe("apple-app-site-association", () => {
  it("leaves the website's own email links out of the app, before the rule that hands the rest to it", async () => {
    const body = await GET().json();
    const components: { "/": string; "?"?: Record<string, string>; exclude?: boolean }[] = body.applinks.details[0].components;
    const web = components.findIndex((rule) => rule["?"]?.via === "web" && rule.exclude === true);
    const catchAll = components.findIndex((rule) => rule["/"] === "/auth/confirm" && !rule["?"]);
    expect(web).toBeGreaterThanOrEqual(0);
    expect(web).toBeLessThan(catchAll);
  });
});
