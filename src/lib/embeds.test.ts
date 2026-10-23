import { describe, expect, it } from "vitest";
import { embedFor } from "./embeds";

describe("embedFor", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&start=42"],
    ["https://youtu.be/dQw4w9WgXcQ?t=1m30s", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&start=90"],
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1"],
    ["https://vimeo.com/123456", "https://player.vimeo.com/video/123456?dnt=1&autoplay=1"],
    ["https://vimeo.com/123456/abc123def", "https://player.vimeo.com/video/123456?dnt=1&autoplay=1&h=abc123def"],
    ["https://vimeo.com/channels/staffpicks/123456", "https://player.vimeo.com/video/123456?dnt=1&autoplay=1"],
    ["https://soundcloud.com/burna-boy/last-last", "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fburna-boy%2Flast-last&visual=false&auto_play=true"],
    ["https://open.spotify.com/intl-fr/track/4uLU6hMCjMI75M1A2tKUQC", "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"],
    ["https://www.tiktok.com/@user/video/7231234567890123456", "https://www.tiktok.com/embed/v2/7231234567890123456"],
  ])("builds a player for %s", (href, src) => {
    expect(embedFor(href)?.src).toBe(src);
  });

  it("marks shorts and TikToks as portrait", () => {
    expect(embedFor("https://youtube.com/shorts/dQw4w9WgXcQ")?.shape).toBe("portrait");
  });

  it.each(["https://soundcloud.com/discover/sets", "https://soundcloud.com/burna-boy/likes", "http://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://evil.example/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "not a url"])(
    "refuses %s",
    (href) => {
      expect(embedFor(href)).toBeNull();
    },
  );
});
