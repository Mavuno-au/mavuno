import { describe, expect, it } from "vitest";
import { isKeyboardOpen, KEYBOARD_MIN } from "./keyboard";

describe("isKeyboardOpen", () => {
  it("opens when a field has focus and the viewport has shrunk", () => {
    expect(isKeyboardOpen(false, true, KEYBOARD_MIN + 1)).toBe(true);
  });

  it("ignores small viewport changes, like a browser toolbar", () => {
    expect(isKeyboardOpen(false, true, KEYBOARD_MIN)).toBe(false);
  });

  it("stays open after the field blurs until the room comes back", () => {
    expect(isKeyboardOpen(true, false, 300)).toBe(true);
    expect(isKeyboardOpen(true, false, 0)).toBe(false);
  });

  it("does not open for a shrunk viewport with nothing focused", () => {
    expect(isKeyboardOpen(false, false, 300)).toBe(false);
  });
});
