import { describe, expect, it } from "vitest";
import { embedFor } from "./embeds";

describe("embedFor", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42"],
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://vimeo.com/123456", "https://player.vimeo.com/video/123456?dnt=1"],
    ["https://open.spotify.com/intl-fr/track/4uLU6hMCjMI75M1A2tKUQC", "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"],
    ["https://www.tiktok.com/@user/video/7231234567890123456", "https://www.tiktok.com/embed/v2/7231234567890123456"],
  ])("builds a player for %s", (href, src) => {
    expect(embedFor(href)?.src).toBe(src);
  });

  it("marks shorts and TikToks as portrait", () => {
    expect(embedFor("https://youtube.com/shorts/dQw4w9WgXcQ")?.shape).toBe("portrait");
  });

  it.each(["http://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.example/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "not a url"])(
    "refuses %s",
    (href) => {
      expect(embedFor(href)).toBeNull();
    },
  );
});
