import { describe, expect, it } from "vitest";
import { findFilter, isExpandable, isFilterKey, notificationGroupSchema, notificationSchema } from "./notifications";

const actor = (id: string) => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  username: `user${id}`,
  display_name: `User ${id}`,
  avatar_url: null,
  colour: 0,
  account_type: "person",
  org_verified: false,
  headline: null,
  city: null,
});

const row = (type: string, extra: Record<string, unknown> = {}) => ({
  id: 1,
  type,
  message: null,
  read_at: null,
  created_at: "2026-10-20T10:00:00+00:00",
  actor: actor("1"),
  following_actor: false,
  post: null,
  event: null,
  rule: null,
  moderation_action_id: null,
  ...extra,
});

const group = (type: string, extra: Record<string, unknown> = {}) =>
  notificationGroupSchema.parse({
    key: `${type}:x`,
    type,
    latest_at: "2026-10-20T10:00:00+00:00",
    count: 1,
    unread_count: 0,
    actor_count: 1,
    actors: [actor("1")],
    latest: row(type),
    ...extra,
  });

describe("notificationGroupSchema", () => {
  it("is unread while any of its notifications is", () => {
    expect(group("like", { count: 3, unread_count: 1 }).unread).toBe(true);
    expect(group("like", { count: 3, unread_count: 0 }).unread).toBe(false);
  });

  it("keeps the people shown and how many there are apart", () => {
    const likes = group("like", { count: 40, actor_count: 38, actors: [actor("1"), actor("2"), actor("3")] });
    expect(likes.actors.map((a) => a.username)).toEqual(["user1", "user2", "user3"]);
    expect(likes.actorCount).toBe(38);
  });

  it("lists follows and mention threads on request, never a single reply", () => {
    expect(isExpandable(group("follow", { actor_count: 2, actors: [actor("1"), actor("2")] }))).toBe(true);
    expect(isExpandable(group("follow"))).toBe(false);
    expect(isExpandable(group("mention", { count: 2 }))).toBe(true);
    expect(isExpandable(group("reply", { count: 1 }))).toBe(false);
    expect(isExpandable(group("like", { count: 9 }))).toBe(false);
  });
});

describe("notificationSchema", () => {
  it("attaches a notice only when a rule is named", () => {
    const removed = notificationSchema.parse(row("moderation", { rule: "safety", moderation_action_id: 7, message: "Your post was removed" }));
    expect(removed.notice).toEqual({ rule: "safety", decision: 7 });
    const approved = notificationSchema.parse(row("moderation", { message: "Your post is up. Thanks for waiting." }));
    expect(approved.notice).toBeNull();
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
