import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const page = () => new Response("<head><title>Inside</title></head>", { headers: { "content-type": "text/html" } });
const fetchMock = vi.fn(async () => page());
vi.mock("undici", () => ({ Agent: class {}, fetch: fetchMock }));
const { fetchLinkPreview, parseMetadata } = await import("./link-preview");

describe("fetchLinkPreview", () => {
  // IP hosts skip the DNS lookup that guards hostnames, so they are refused before any request.
  it.each([
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/latest/meta-data",
    "http://[::ffff:a00:1]/",
    "http://[0:0:0:0:0:ffff:7f00:1]/",
    "http://[::127.0.0.1]/",
    "http://[64:ff9b::a9fe:a9fe]/",
    "http://[2002:a9fe:a9fe::]/",
    "http://[2001::1]/",
    "http://[fec0::1]/",
    "http://[100::1]/",
    "http://192.0.2.1/",
    "https://user:secret@example.org/",
    "https://user@example.org/",
  ])("never requests %s", async (url) => {
    fetchMock.mockClear();
    expect(await fetchLinkPreview(url)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows no redirect to a mapped loopback address", async () => {
    fetchMock.mockClear();
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 302, headers: { location: "http://[::ffff:127.0.0.1]/" } }));
    expect(await fetchLinkPreview("https://example.org/")).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requests public hosts", async () => {
    fetchMock.mockClear();
    expect((await fetchLinkPreview("https://example.org/"))?.title).toBe("Inside");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("parseMetadata", () => {
  it("prefers Open Graph tags and decodes entities", () => {
    const html = `<head><title>Fallback</title>
      <meta property="og:title" content="Jollof &amp; Friends">
      <meta name="description" content="A night of food">
      <meta property="og:image" content="/cover.jpg">
      <meta property="og:site_name" content="Brisbane Events"></head>`;
    expect(parseMetadata(html, "https://events.example/jollof")).toEqual({
      url: "https://events.example/jollof",
      title: "Jollof & Friends",
      description: "A night of food",
      image: "https://events.example/cover.jpg",
      siteName: "Brisbane Events",
    });
  });

  it("falls back to the title tag and host name", () => {
    const preview = parseMetadata("<title> Hello\n world </title>", "https://www.example.org/a");
    expect(preview).toMatchObject({ title: "Hello world", siteName: "example.org", image: null });
  });

  it("drops images that are not served over https", () => {
    const html = `<meta property="og:title" content="x"><meta property="og:image" content="http://cdn.example/a.jpg">`;
    expect(parseMetadata(html, "https://example.org").image).toBeNull();
  });
});
