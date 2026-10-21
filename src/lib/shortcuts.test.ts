import { describe, expect, it } from "vitest";
import { shortcutKey } from "./shortcuts";

const press = (key: string, code: string, shiftKey = false) => shortcutKey({ key, code, shiftKey });

describe("shortcutKey", () => {
  it("keeps Latin letters and symbols as typed", () => {
    expect(press("j", "KeyJ")).toBe("j");
    expect(press("?", "Slash", true)).toBe("?");
    expect(press("/", "Slash")).toBe("/");
  });

  it("maps a non-Latin letter to the key's US position", () => {
    expect(press("ت", "KeyJ")).toBe("j");
    expect(press("ሀ", "KeyK")).toBe("k");
    expect(press("й", "KeyQ")).toBe("q");
    expect(press("ظ", "Slash", true)).toBe("?");
  });

  it("leaves named keys alone", () => {
    expect(press("Enter", "Enter")).toBe("Enter");
    expect(press("ArrowDown", "ArrowDown")).toBe("ArrowDown");
  });

  it("does not invent a shortcut for a non-Latin key off the letter rows", () => {
    expect(press("،", "Comma")).toBe("،");
  });
});
