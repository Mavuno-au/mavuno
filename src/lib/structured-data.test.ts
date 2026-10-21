import { describe, expect, it } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test";
process.env.NEXT_PUBLIC_SITE_URL = "https://mavuno.example";

const { breadcrumbJsonLd } = await import("./structured-data");

describe("breadcrumbJsonLd", () => {
  it("numbers the trail and links every crumb but the page itself", () => {
    const data = breadcrumbJsonLd([{ name: "Opportunities", path: "/opportunities" }, { name: "Jobs", path: "/opportunities?type=job" }, { name: "Barista" }]);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Opportunities", item: "https://mavuno.example/opportunities" },
      { "@type": "ListItem", position: 2, name: "Jobs", item: "https://mavuno.example/opportunities?type=job" },
      { "@type": "ListItem", position: 3, name: "Barista" },
    ]);
  });
});
