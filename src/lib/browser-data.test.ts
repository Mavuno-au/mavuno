import { beforeEach, describe, expect, it } from "vitest";
import { draftPrefix, forgetDeletedAccount, noteDeleting } from "./browser-data";

class MemoryStorage {
  private items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
  removeItem = (key: string) => void this.items.delete(key);
  keys = () => [...this.items.keys()];
}

const local = new MemoryStorage();
const session = new MemoryStorage();
// Object.keys(localStorage) lists stored keys in a browser; mirror that here.
Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => new Proxy(local, { ownKeys: () => local.keys(), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }) });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });

beforeEach(() => {
  for (const key of local.keys()) local.removeItem(key);
  for (const key of session.keys()) session.removeItem(key);
});

describe("forgetDeletedAccount", () => {
  it("forgets the deleted account's drafts and keeps someone else's", () => {
    local.setItem(`${draftPrefix("gone")}compose`, "half a post");
    local.setItem(`${draftPrefix("other")}compose`, "their post");
    noteDeleting("gone");
    forgetDeletedAccount();
    expect(local.getItem(`${draftPrefix("gone")}compose`)).toBeNull();
    expect(local.getItem(`${draftPrefix("other")}compose`)).toBe("their post");
    expect(session.getItem("mavuno:deleting")).toBeNull();
  });

  it("does nothing when no deletion was noted", () => {
    local.setItem(`${draftPrefix("someone")}compose`, "a draft");
    forgetDeletedAccount();
    expect(local.getItem(`${draftPrefix("someone")}compose`)).toBe("a draft");
  });
});
