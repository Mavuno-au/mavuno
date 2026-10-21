import { describe, expect, it } from "vitest";
import { canStartSwipe, SCREEN_EDGE, SWIPE_MAX_MS, SWIPE_MIN, swipedTab } from "./swipe";

const tabs = ["/", "/latest", "/trending"] as const;

describe("swipedTab", () => {
  it("swiping left moves to the next tab and right to the previous", () => {
    expect(swipedTab(tabs, "/latest", -SWIPE_MIN, 0, 200)).toBe("/trending");
    expect(swipedTab(tabs, "/latest", SWIPE_MIN, 0, 200)).toBe("/");
  });

  it("stops at either end", () => {
    expect(swipedTab(tabs, "/", 100, 0, 200)).toBeNull();
    expect(swipedTab(tabs, "/trending", -100, 0, 200)).toBeNull();
  });

  it("ignores short, angled or slow swipes", () => {
    expect(swipedTab(tabs, "/latest", -(SWIPE_MIN - 1), 0, 200)).toBeNull();
    expect(swipedTab(tabs, "/latest", -80, 50, 200)).toBeNull();
    expect(swipedTab(tabs, "/latest", -80, 0, SWIPE_MAX_MS + 1)).toBeNull();
  });

  it("knows nothing about a tab that isn't in the list", () => {
    expect(swipedTab(tabs, "/saved", -100, 0, 200)).toBeNull();
  });
});

describe("canStartSwipe", () => {
  it("leaves the screen's edges to the browser", () => {
    expect(canStartSwipe(SCREEN_EDGE - 1, 400, 1)).toBe(false);
    expect(canStartSwipe(400 - SCREEN_EDGE + 1, 400, 1)).toBe(false);
    expect(canStartSwipe(200, 400, 1)).toBe(true);
  });

  it("stands down while pinched in", () => {
    expect(canStartSwipe(200, 400, 1.5)).toBe(false);
  });
});
