import { describe, expect, it } from "vitest";
import { clearOwnDeletion, markOwnDeletion, ownDeletionAt, shouldCover, UNDO_WINDOW_MS } from "./post-presence";

describe("shouldCover", () => {
  it("never covers a post that is still there", () => {
    expect(shouldCover({ kind: "present" }, null, 1000)).toBe(false);
    expect(shouldCover({ kind: "present" }, 0, 1000)).toBe(false);
  });

  it("covers a post someone else deleted straight away", () => {
    expect(shouldCover({ kind: "deleted" }, null, 1000)).toBe(true);
  });

  it("waits out the reader's own Undo before covering", () => {
    expect(shouldCover({ kind: "deleted" }, 1000, 1000 + UNDO_WINDOW_MS)).toBe(false);
    expect(shouldCover({ kind: "deleted" }, 1000, 1000 + UNDO_WINDOW_MS + 1)).toBe(true);
  });

  it("covers a post that became unavailable, whoever caused it", () => {
    expect(shouldCover({ kind: "unavailable" }, Date.now(), Date.now())).toBe(true);
  });
});

describe("own deletions", () => {
  it("remembers a deletion until it is undone", () => {
    markOwnDeletion("a", 5);
    expect(ownDeletionAt("a")).toBe(5);
    clearOwnDeletion("a");
    expect(ownDeletionAt("a")).toBeNull();
  });
});
