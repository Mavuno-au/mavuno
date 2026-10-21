import { describe, expect, it } from "vitest";
import { menuKeyAction } from "./menu";

describe("menuKeyAction", () => {
  it("moves down and up, wrapping at either end", () => {
    expect(menuKeyAction("ArrowDown", 0, 3)).toEqual({ kind: "focus", index: 1 });
    expect(menuKeyAction("ArrowDown", 2, 3)).toEqual({ kind: "focus", index: 0 });
    expect(menuKeyAction("ArrowUp", 0, 3)).toEqual({ kind: "focus", index: 2 });
  });

  it("starts from the ends when nothing in the menu has focus", () => {
    expect(menuKeyAction("ArrowDown", -1, 3)).toEqual({ kind: "focus", index: 0 });
    expect(menuKeyAction("ArrowUp", -1, 3)).toEqual({ kind: "focus", index: 2 });
  });

  it("jumps with Home and End", () => {
    expect(menuKeyAction("Home", 2, 3)).toEqual({ kind: "focus", index: 0 });
    expect(menuKeyAction("End", 0, 3)).toEqual({ kind: "focus", index: 2 });
  });

  it("closes to the trigger on Escape and just closes on Tab", () => {
    expect(menuKeyAction("Escape", 1, 3)).toEqual({ kind: "close", refocus: true });
    expect(menuKeyAction("Tab", 1, 3)).toEqual({ kind: "close", refocus: false });
  });

  it("leaves other keys alone", () => {
    expect(menuKeyAction("Enter", 1, 3)).toEqual({ kind: "none" });
  });
});
