import { useCallback, useEffect, useRef, useState } from "react";
import { reasonOf, type Reason } from "@/data/errors";

// Any paged list that isn't posts: people, notifications, conversations,
// events. Like use-feed.ts, what was loaded for another key reads as loading.
export type ListState<Item> =
  | { kind: "loading" }
  | { kind: "failed"; reason: Reason }
  | { kind: "ready"; items: Item[]; next: string | null; more: "idle" | "loading" | "failed"; refreshing: boolean };

export type ListPage<Item> = { items: Item[]; next: string | null };

export function useList<Item extends { id: string }>(load: (cursor: string | null) => Promise<ListPage<Item>>, key: string, { enabled = true } = {}) {
  const [stored, setStored] = useState<{ key: string; state: ListState<Item> }>({ key: "", state: { kind: "loading" } });
  const state: ListState<Item> = stored.key === key ? stored.state : { kind: "loading" };
  const latest = useRef({ load, key, state });
  const generation = useRef(0);
  // State lands a render later, so two end-of-list calls in a row would both pass the check.
  const loadingMore = useRef(false);

  useEffect(() => {
    latest.current = { load, key, state };
  });

  const fetchFirst = useCallback((forKey: string) => {
    const current = ++generation.current;
    latest.current.load(null).then(
      (page) => {
        if (current === generation.current) setStored({ key: forKey, state: { kind: "ready", items: page.items, next: page.next, more: "idle", refreshing: false } });
      },
      (error: unknown) => {
        if (current !== generation.current) return;
        setStored((previous) =>
          previous.key === forKey && previous.state.kind === "ready" ? { key: forKey, state: { ...previous.state, refreshing: false } } : { key: forKey, state: { kind: "failed", reason: reasonOf(error) } },
        );
      },
    );
  }, []);

  useEffect(() => {
    if (enabled) fetchFirst(key);
  }, [key, enabled, fetchFirst]);

  const loadMore = useCallback(() => {
    const { state: shown, load: read, key: forKey } = latest.current;
    if (shown.kind !== "ready" || !shown.next || shown.more === "loading" || shown.refreshing || loadingMore.current) return;
    loadingMore.current = true;
    const current = generation.current;
    setStored((previous) => (previous.key === forKey && previous.state.kind === "ready" ? { key: forKey, state: { ...previous.state, more: "loading" } } : previous));
    read(shown.next).then(
      (page) => {
        loadingMore.current = false;
        if (current !== generation.current) return;
        setStored((previous) => {
          if (previous.key !== forKey || previous.state.kind !== "ready") return previous;
          const seen = new Set(previous.state.items.map((item) => item.id));
          return { key: forKey, state: { ...previous.state, items: [...previous.state.items, ...page.items.filter((item) => !seen.has(item.id))], next: page.next, more: "idle" } };
        });
      },
      () => {
        loadingMore.current = false;
        if (current !== generation.current) return;
        setStored((previous) => (previous.key === forKey && previous.state.kind === "ready" ? { key: forKey, state: { ...previous.state, more: "failed" } } : previous));
      },
    );
  }, []);

  const refresh = useCallback(() => {
    const { key: forKey } = latest.current;
    setStored((previous) => (previous.key === forKey && previous.state.kind === "ready" ? { key: forKey, state: { ...previous.state, refreshing: true } } : previous));
    fetchFirst(forKey);
  }, [fetchFirst]);

  const retry = useCallback(() => {
    const { key: forKey } = latest.current;
    setStored({ key: forKey, state: { kind: "loading" } });
    fetchFirst(forKey);
  }, [fetchFirst]);

  // Change items already shown, such as removing one that was cancelled.
  const edit = useCallback((change: (items: Item[]) => Item[]) => {
    const { key: forKey } = latest.current;
    setStored((previous) => (previous.key === forKey && previous.state.kind === "ready" ? { key: forKey, state: { ...previous.state, items: change(previous.state.items) } } : previous));
  }, []);

  return { state, loadMore, refresh, retry, edit };
}
