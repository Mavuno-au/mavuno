import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PostRow, ReplyPreviews } from "@/lib/domain";
import { reasonOf, type Reason } from "@/data/errors";
import type { Page } from "@/data/posts";
import { onPostCreated, onRelationChanged } from "@/util/events";

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
// `takesPosts` says the list shows new top-level posts, so it rereads itself
// after the member posts one.
export function useFeed(load: (cursor: string | null) => Promise<Page>, key: string, { enabled = true, takesPosts = false } = {}) {
  const [stored, setStored] = useState<{ key: string; state: FeedState }>({ key: "", state: LOADING });
  const state = stored.key === key ? stored.state : LOADING;
  const latest = useRef({ load, key, state });
  const generation = useRef(0);
  const loadingMore = useRef(false);

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

  // After a mute or block the posts already shown are reread, quietly.
  useEffect(() => {
    if (!enabled) return;
    return onRelationChanged(() => {
      if (latest.current.state.kind === "ready") refresh();
      else retry();
    });
  }, [enabled, refresh, retry]);

  useEffect(() => {
    if (!enabled || !takesPosts) return;
    return onPostCreated((post) => {
      if (post.parentId === null && latest.current.state.kind === "ready") refresh();
    });
  }, [enabled, takesPosts, refresh]);

  return { state, loadMore, refresh, retry };
}
