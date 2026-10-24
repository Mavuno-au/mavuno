import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PostRow, ReplyPreviews } from "@/lib/domain";
import { reasonOf, type Reason } from "@/data/errors";
import type { Page } from "@/data/posts";
import { onPostCreated, onRelationChanged, type CreatedPost } from "@/util/events";

export type FeedState =
  | { kind: "loading" }
  | { kind: "failed"; reason: Reason }
  | {
      kind: "ready";
      posts: PostRow[];
      previews: ReplyPreviews;
      next: string | null;
      more: "idle" | "loading" | "failed";
      refreshing: boolean;
      // The last refresh failed, so these are the posts from earlier.
      stale: boolean;
    };

const LOADING: FeedState = { kind: "loading" };

// Pages of posts after a cursor. `key` names what is being read: what was
// loaded for another key reads as loading, and late answers for it are dropped.
// `takesPosts` says which of the member's new top-level posts the list shows,
// so it rereads itself after they post one of those. `ownerId` is the
// profile a list belongs to, whose posts stay when they are muted.
export function useFeed(
  load: (cursor: string | null) => Promise<Page>,
  key: string,
  { enabled = true, takesPosts, ownerId }: { enabled?: boolean; takesPosts?: (post: CreatedPost) => boolean; ownerId?: string } = {},
) {
  const [stored, setStored] = useState<{ key: string; state: FeedState }>({ key: "", state: LOADING });
  const state = stored.key === key ? stored.state : LOADING;
  const latest = useRef({ load, key, state });
  const generation = useRef(0);
  const loadingMore = useRef(false);
  // Set by the list: a reader down the feed keeps their place when they post.
  const scrolledDown = useRef(false);
  const setScrolledDown = useCallback((down: boolean) => {
    scrolledDown.current = down;
  }, []);

  useLayoutEffect(() => {
    latest.current = { load, key, state };
  });

  const fetchFirst = useCallback((forKey: string) => {
    const current = ++generation.current;
    loadingMore.current = false;
    latest.current.load(null).then(
      (page) => {
        if (current === generation.current) setStored({ key: forKey, state: { kind: "ready", ...page, more: "idle", refreshing: false, stale: false } });
      },
      (error: unknown) => {
        if (current !== generation.current) return;
        setStored((previous) =>
          previous.key === forKey && previous.state.kind === "ready"
            ? { key: forKey, state: { ...previous.state, refreshing: false, stale: true } }
            : { key: forKey, state: { kind: "failed", reason: reasonOf(error) } },
        );
      },
    );
  }, []);

  useEffect(() => {
    if (enabled) fetchFirst(key);
  }, [key, enabled, fetchFirst]);

  const update = useCallback((forKey: string, change: (state: FeedState) => FeedState) => {
    setStored((previous) => (previous.key === forKey ? { key: forKey, state: change(previous.state) } : previous));
  }, []);

  const loadMore = useCallback(() => {
    const { state: shown, load: read, key: forKey } = latest.current;
    if (shown.kind !== "ready" || !shown.next || shown.refreshing || loadingMore.current) return;
    loadingMore.current = true;
    const current = generation.current;
    update(forKey, (previous) => (previous.kind === "ready" ? { ...previous, more: "loading" } : previous));
    read(shown.next)
      .then(
        (page) => {
          if (current !== generation.current) return;
          update(forKey, (previous) => {
            if (previous.kind !== "ready") return previous;
            const seen = new Set(previous.posts.map((post) => post.id));
            return { ...previous, posts: [...previous.posts, ...page.posts.filter((post) => !seen.has(post.id))], previews: { ...previous.previews, ...page.previews }, next: page.next, more: "idle" };
          });
        },
        () => {
          if (current === generation.current) update(forKey, (previous) => (previous.kind === "ready" ? { ...previous, more: "failed" } : previous));
        },
      )
      .finally(() => {
        if (current === generation.current) loadingMore.current = false;
      });
  }, [update]);

  const refresh = useCallback(() => {
    const { key: forKey } = latest.current;
    update(forKey, (previous) => (previous.kind === "ready" ? { ...previous, refreshing: true } : previous));
    fetchFirst(forKey);
  }, [fetchFirst, update]);

  const retry = useCallback(() => {
    const { key: forKey } = latest.current;
    setStored({ key: forKey, state: LOADING });
    fetchFirst(forKey);
  }, [fetchFirst]);

  // After a mute or block that person's posts leave the list and the pages
  // stay, so a reader keeps their place, as on the website. An unmute comes
  // from their profile or Settings, where a quiet reread loses nothing. A
  // muted person's own profile still lists their posts (`ownerId`).
  useEffect(() => {
    if (!enabled) return;
    return onRelationChanged(({ profileId, relation, on }) => {
      const { state: shown, key: forKey } = latest.current;
      if (shown.kind !== "ready") return retry();
      if (profileId === ownerId) return;
      if (!on) return refresh();
      const theirs = (post: PostRow) => post.kind === "post" && (post.authorId === profileId || (relation === "block" && post.createdBy === profileId));
      update(forKey, (previous) => (previous.kind === "ready" ? { ...previous, posts: previous.posts.filter((post) => !theirs(post)) } : previous));
    });
  }, [enabled, ownerId, refresh, retry, update]);

  useEffect(() => {
    if (!enabled || !takesPosts) return;
    return onPostCreated((post) => {
      if (post.parentId === null && takesPosts(post) && latest.current.state.kind === "ready" && !scrolledDown.current) refresh();
    });
  }, [enabled, takesPosts, refresh]);

  return useMemo(() => ({ state, loadMore, refresh, retry, setScrolledDown }), [state, loadMore, refresh, retry, setScrolledDown]);
}
