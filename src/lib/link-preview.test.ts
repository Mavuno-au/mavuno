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
    expect((await fetchLinkPreview(url)).kind).toBe("none");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows no redirect to a mapped loopback address", async () => {
    fetchMock.mockClear();
    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 302, headers: { location: "http://[::ffff:127.0.0.1]/" } }));
    expect((await fetchLinkPreview("https://example.org/")).kind).toBe("none");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("requests public hosts in Australian English", async () => {
    fetchMock.mockClear();
    const fetched = await fetchLinkPreview("https://example.org/");
    expect(fetched.kind === "found" && fetched.preview.title).toBe("Inside");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toMatchObject([expect.anything(), { headers: { "accept-language": "en-AU,en;q=0.9" } }]);
  });

  it("tries busy servers and dropped connections again, but not missing pages", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    expect((await fetchLinkPreview("https://example.org/")).kind).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    expect((await fetchLinkPreview("https://example.org/")).kind).toBe("retry");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await fetchLinkPreview("https://example.org/")).kind).toBe("retry");
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect((await fetchLinkPreview("https://example.org/")).kind).toBe("none");
  });

  it("does not retry addresses the lookup refused", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed", { cause: new Error("Blocked address") }));
    expect(await fetchLinkPreview("https://internal.example/")).toEqual({ kind: "none", reason: "Blocked address" });
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

  it("keeps apostrophes inside quoted values", () => {
    const html = `<meta property="og:title" content="Here's Australia's best jollof"><meta name='description' content='She said "come"'>`;
    expect(parseMetadata(html, "https://example.org")).toMatchObject({ title: "Here's Australia's best jollof", description: 'She said "come"' });
  });

  it("prefers the secure image and skips ones that don't parse", () => {
    const html = `<meta property="og:title" content="x"><meta property="og:image:secure_url" content="https://[bad"><meta property="og:image" content="https://cdn.example/a.jpg">`;
    expect(parseMetadata(html, "https://example.org").image).toBe("https://cdn.example/a.jpg");
  });

  it("drops images that are not served over https", () => {
    const html = `<meta property="og:title" content="x"><meta property="og:image" content="http://cdn.example/a.jpg">`;
    expect(parseMetadata(html, "https://example.org").image).toBeNull();
  });
});

describe("card text the database can store", () => {
  it("cuts by whole characters and leaves impossible entities as written", () => {
    const card = parseMetadata(`<meta property="og:title" content="${"x".repeat(199)}😀 more"><meta property="og:description" content="a&#0;b &#99999999; &#abc;">`, "https://example.com/a");
    expect(card.title).toBe(`${"x".repeat(199)}😀`);
    expect(card.description).toBe("a&#0;b &#99999999; &#abc;");
  });
});
