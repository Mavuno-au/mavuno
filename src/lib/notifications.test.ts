import { describe, expect, it } from "vitest";
import { findFilter, groupNotifications, isFilterKey, type Notification } from "./notifications";

const actor = (id: string) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  username: `user${id}`,
  displayName: `User ${id}`,
  avatarUrl: null,
  colour: 0 as const,
  accountType: "person" as const,
  verified: false,
  headline: null,
  city: null,
});

let nextId = 1;
const make = (type: Notification["type"], who: string, createdAt: string, extra: Partial<Notification> = {}): Notification => ({
  id: nextId++,
  type,
  message: null,
  unread: false,
  createdAt,
  actor: actor(who),
  followingActor: false,
  post: null,
  event: null,
  notice: null,
  ...extra,
});

const post = { id: "11111111-1111-4111-8111-111111111111", body: "Hello", isReply: false, threadId: "11111111-1111-4111-8111-111111111111" };
const reply = (id: string, threadId: string) => ({ id, body: "Reply", isReply: true, threadId });
const THREAD = "22222222-2222-4222-8222-222222222222";
const OTHER_THREAD = "33333333-3333-4333-8333-333333333333";

describe("groupNotifications", () => {
  it("groups likes on the same post and counts each person once", () => {
    const groups = groupNotifications([
      make("like", "1", "2026-10-20T10:00:00Z", { post, unread: true }),
      make("like", "2", "2026-10-20T09:00:00Z", { post }),
      make("like", "1", "2026-10-19T09:00:00Z", { post }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.actors.map((a) => a.username)).toEqual(["user1", "user2"]);
    expect(groups[0]?.unread).toBe(true);
  });

  it("groups follows by the reader's local day, not the UTC date", () => {
    const groups = groupNotifications(
      [
        make("follow", "1", "2026-10-20T10:00:00Z"),
        make("follow", "2", "2026-10-19T14:00:00Z"),
        make("follow", "3", "2026-10-19T08:00:00Z"),
      ],
      "Australia/Sydney",
    );
    expect(groups.map((g) => g.actors.length)).toEqual([2, 1]);
  });

  it("follows the time zone it is given", () => {
    const follows = [make("follow", "1", "2026-10-20T10:00:00Z"), make("follow", "2", "2026-10-19T14:00:00Z")];
    expect(groupNotifications(follows, "Australia/Sydney")).toHaveLength(1);
    expect(groupNotifications(follows, "UTC")).toHaveLength(2);
  });

  it("groups replies and mentions in the same thread", () => {
    const groups = groupNotifications([
      make("reply", "1", "2026-10-20T10:00:00Z", { post: reply("44444444-4444-4444-8444-444444444441", THREAD) }),
      make("mention", "2", "2026-10-20T09:00:00Z", { post: reply("44444444-4444-4444-8444-444444444442", THREAD) }),
      make("reply", "3", "2026-10-20T08:00:00Z", { post: reply("44444444-4444-4444-8444-444444444443", OTHER_THREAD) }),
      make("mention", "4", "2026-10-20T07:00:00Z", { post: { ...post, id: THREAD, threadId: THREAD } }),
    ]);
    expect(groups.map((g) => [g.type, g.items.length])).toEqual([
      ["reply", 3],
      ["reply", 1],
    ]);
    expect(groups[0]?.actors.map((a) => a.username)).toEqual(["user1", "user2", "user4"]);
  });

  it("keeps quotes separate", () => {
    const groups = groupNotifications([make("quote", "1", "2026-10-20T10:00:00Z", { post }), make("quote", "2", "2026-10-20T09:00:00Z", { post })]);
    expect(groups).toHaveLength(2);
  });

  it("groups RSVPs per event across days", () => {
    const event = { id: "55555555-5555-4555-8555-555555555555", title: "Picnic" };
    const groups = groupNotifications([
      make("event_rsvp", "1", "2026-10-20T10:00:00Z", { event }),
      make("event_rsvp", "2", "2026-10-15T10:00:00Z", { event }),
      make("event_rsvp", "3", "2026-10-15T09:00:00Z", { event: { ...event, id: "66666666-6666-4666-8666-666666666666" } }),
    ]);
    expect(groups.map((g) => g.actors.length)).toEqual([2, 1]);
  });
});

describe("findFilter", () => {
  it("falls back to all", () => {
    expect(findFilter("likes").types).toEqual(["like"]);
    expect(findFilter("nope").key).toBe("all");
    expect(isFilterKey("follows")).toBe(true);
    expect(isFilterKey("nope")).toBe(false);
  });
});
