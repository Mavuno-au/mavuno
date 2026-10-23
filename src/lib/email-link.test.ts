import { describe, expect, it } from "vitest";

process.env.NEXT_PUBLIC_SITE_URL = "https://mavuno.example";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const { emailLink } = await import("./email-link");
const { appRoute } = await import("./app-links");
const { GET } = await import("@/app/.well-known/apple-app-site-association/route");

type Rule = { "/": string; "?"?: Record<string, string>; exclude?: boolean };
const rules = async (): Promise<Rule[]> => (await GET().json()).applinks.details[0].components;

// iOS's reading of the file: the first rule whose path and query match decides.
function opensApp(components: Rule[], href: string) {
  const url = new URL(href, "https://mavuno.example");
  const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  const rule = components.find((candidate) => glob(candidate["/"]).test(url.pathname) && Object.entries(candidate["?"] ?? {}).every(([key, value]) => url.searchParams.get(key) === value));
  return rule !== undefined && rule.exclude !== true;
}

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
    const components = await rules();
    const web = components.findIndex((rule) => rule["?"]?.via === "web" && rule.exclude === true);
    const catchAll = components.findIndex((rule) => rule["/"] === "/auth/confirm" && !rule["?"]);
    expect(web).toBeGreaterThanOrEqual(0);
    expect(web).toBeLessThan(catchAll);
  });

  it("opens the app only for links it has a screen for", async () => {
    const components = await rules();
    const app = ["/@amina", "/@amina/posts/5f0c", "/@amina/replies", "/@amina/followers", "/spaces/brisbane", "/events/5f0c", "/opportunities/5f0c", "/topics/afrobeats", "/join/amina", "/auth/confirm?type=email"];
    const web = ["/", "/about", "/@amina/feed.xml", "/spaces/new", "/spaces/joined", "/spaces/brisbane/feed.xml", "/events/new", "/events/5f0c/edit", "/events/5f0c/calendar", "/opportunities/new", "/opportunities/5f0c/edit", "/auth/confirm?type=recovery", "/auth/confirm?via=web&type=email"];
    for (const path of app) expect(opensApp(components, path), path).toBe(true);
    for (const path of web) expect(opensApp(components, path), path).toBe(false);
    for (const path of app.filter((path) => !path.startsWith("/join/") && !path.startsWith("/auth/"))) expect(appRoute(path), path).not.toBeNull();
  });
});

describe("appRoute", () => {
  it("turns the website's addresses into the app's routes", () => {
    expect(appRoute("/@amina")).toBe("/profile/amina");
    expect(appRoute("/@amina/")).toBe("/profile/amina");
    expect(appRoute("/@amina/media")).toBe("/profile/amina");
    expect(appRoute("/@amina/posts/5f0c")).toBe("/post/5f0c");
    expect(appRoute("/@amina/following")).toBe("/connections/amina?direction=following");
    expect(appRoute("/spaces/brisbane")).toBe("/space/brisbane");
    expect(appRoute("/events/5f0c")).toBe("/event/5f0c");
    expect(appRoute("/opportunities/5f0c")).toBe("/opportunity/5f0c");
    expect(appRoute("/topics/afrobeats")).toBe("/topic/afrobeats");
  });

  it("leaves pages the app doesn't have to the website", () => {
    for (const path of ["/", "/about", "/spaces/new", "/events/new", "/events/5f0c/edit", "/@amina/feed.xml", "/@amina/posts/5f0c/opengraph-image"]) expect(appRoute(path), path).toBeNull();
  });
});
