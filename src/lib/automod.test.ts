import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const env: { OPENAI_API_KEY: string | undefined } = { OPENAI_API_KEY: "sk-test" };
vi.mock("@/lib/server-env", () => ({ serverEnv: env }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
const { checkContent, flaggedCategories, moderationInputs } = await import("./automod");

const POST = "6f1d4c1e-5b1a-4f0e-9a51-2a4c6a1d9b10";
const result = (scores: Record<string, number>, flagged: string[] = []) => ({
  categories: Object.fromEntries(Object.keys(scores).map((category) => [category, flagged.includes(category)])),
  category_scores: scores,
});

describe("flaggedCategories", () => {
  it("flags what OpenAI flags and anything scoring 0.2 or more", () => {
    expect(flaggedCategories([result({ hate: 0.05, harassment: 0.2, violence: 0.01 }, ["hate"])])).toEqual(["harassment", "hate"]);
  });

  it("is strictest about minors", () => {
    expect(flaggedCategories([result({ "sexual/minors": 0.011, sexual: 0.1 })])).toEqual(["sexual/minors"]);
  });

  it("merges every result", () => {
    expect(flaggedCategories([result({ hate: 0.3 }), result({ hate: 0.4, violence: 0.5 })])).toEqual(["hate", "violence"]);
  });
});

describe("moderationInputs", () => {
  const image = (url: string) => ({ type: "image_url", image_url: { url } });

  it("sends the text with the first image and each other image alone", () => {
    expect(moderationInputs("Hello", ["https://a", "https://b"])).toEqual([[{ type: "text", text: "Hello" }, image("https://a")], [image("https://b")]]);
  });

  it("handles posts with only text or only images", () => {
    expect(moderationInputs("Hello", [])).toEqual([[{ type: "text", text: "Hello" }]]);
    expect(moderationInputs("", ["https://a"])).toEqual([[image("https://a")]]);
  });
});

describe("checkContent", () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);

  beforeEach(() => {
    env.OPENAI_API_KEY = "sk-test";
    rpc.mockReset();
    fetchMock.mockReset();
    rpc.mockResolvedValue({ data: { text: "Some words", images: [] }, error: null });
  });

  it("holds a flagged post with its categories", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [result({ harassment: 0.6, hate: 0.1 }, ["harassment"])] }));
    expect(await checkContent("post", POST)).toEqual({ kind: "done" });
    expect(rpc).toHaveBeenLastCalledWith("automatic_hold", { p_target_type: "post", p_target_id: POST, p_categories: ["harassment"] });
  });

  it("checks listings the same way", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [result({ illicit: 0.9 }, ["illicit"])] }));
    await checkContent("opportunity", POST);
    expect(rpc).toHaveBeenNthCalledWith(1, "automatic_check_subject", { p_target_type: "opportunity", p_target_id: POST });
    expect(rpc).toHaveBeenLastCalledWith("automatic_hold", { p_target_type: "opportunity", p_target_id: POST, p_categories: ["illicit"] });
  });

  it("leaves a clean post alone", async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [result({ harassment: 0.01 })] }));
    expect(await checkContent("post", POST)).toEqual({ kind: "done" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("asks to try again when OpenAI fails, and holds nothing", async () => {
    fetchMock.mockResolvedValue(new Response("Rate limited", { status: 429 }));
    expect((await checkContent("post", POST)).kind).toBe("retry");
    fetchMock.mockRejectedValue(new Error("offline"));
    expect((await checkContent("post", POST)).kind).toBe("retry");
    expect(rpc.mock.calls.filter(([name]) => name === "automatic_hold")).toEqual([]);
  });

  it("holds what one image flagged even if another request failed", async () => {
    rpc.mockResolvedValueOnce({ data: { text: "Words", images: ["https://a", "https://b"] }, error: null });
    fetchMock.mockResolvedValueOnce(Response.json({ results: [result({ violence: 0.7 })] })).mockResolvedValueOnce(new Response("", { status: 500 }));
    expect(await checkContent("post", POST)).toEqual({ kind: "done" });
    expect(rpc).toHaveBeenLastCalledWith("automatic_hold", { p_target_type: "post", p_target_id: POST, p_categories: ["violence"] });
  });

  it("skips what the database says needs no check", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await checkContent("post", POST)).toEqual({ kind: "done" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without an OpenAI key", async () => {
    env.OPENAI_API_KEY = undefined;
    expect(await checkContent("post", POST)).toEqual({ kind: "done" });
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
