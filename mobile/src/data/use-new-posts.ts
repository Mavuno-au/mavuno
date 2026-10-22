import { useFocusEffect, useIsFocused } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { supabase } from "@/data/supabase";
import { useSignificantReturn } from "@/util/app-state";
import { createEvent } from "@/util/events";

// Only Following and Latest are asked, as on the website.
export type FeedKind = "following" | "latest";

// How long a feed can sit before coming back to it asks whether anything new
// was posted, and how often to ask while it stays on screen.
const CHECK_AFTER_FOCUS = 60 * 1000;
const CHECK_EVERY = 2 * 60 * 1000;

// How many posts are newer than the top of the feed on screen, found out
// cheaply (one count) when the reader comes back to the feed after a minute,
// returns to the app after two, or keeps it open. `since` is the time of the
// newest post shown; a count is kept with the page it was for, so a new page
// starts from none. Nothing is asked while the feed is hidden, loading or
// refreshing. `dismiss` clears the count: a refresh answers the question.
// `away` keeps asking while another tab is in front, for the Home tab's dot.
export function useNewPosts({ feed, since, active, busy, away = false }: { feed: FeedKind; since: string | null; active: boolean; busy: boolean; away?: boolean }): [count: number, dismiss: () => void] {
  const key = `${feed}|${since ?? ""}`;
  const [stored, setStored] = useState({ key, count: 0 });
  const count = stored.key === key ? stored.count : 0;
  const checked = useRef(0);
  const focused = useIsFocused();
  const live = active && (focused || away) && !busy && since !== null;
  const latest = useRef({ feed, since, key, live });

  useEffect(() => {
    latest.current = { feed, since, key, live };
  });

  // A page just arrived; it is as fresh as a check would be.
  useEffect(() => {
    checked.current = Date.now();
  }, [key]);

  const check = useCallback(() => {
    const { feed: forFeed, since: forSince, key: forKey, live: ready } = latest.current;
    if (!ready || forSince === null) return;
    checked.current = Date.now();
    void supabase.rpc("count_new_posts", { p_feed: forFeed, p_since: forSince }).then(({ data, error }) => {
      const found = error ? undefined : z.number().int().nonnegative().safeParse(data).data;
      if (found !== undefined && latest.current.key === forKey) setStored({ key: forKey, count: found });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - checked.current >= CHECK_AFTER_FOCUS) check();
    }, [check]),
  );

  useSignificantReturn(check);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(check, CHECK_EVERY);
    return () => clearInterval(timer);
  }, [live, check]);

  const dismiss = useCallback(() => setStored((previous) => ({ key: previous.key, count: 0 })), []);
  return [count, dismiss];
}

// Whether Following has posts newer than the ones on Home, for the dot on
// the Home tab, as Bluesky's bottom bar shows.
let followingFresh = false;
const freshChanged = createEvent();

export function setFollowingFresh(fresh: boolean) {
  if (fresh === followingFresh) return;
  followingFresh = fresh;
  freshChanged.emit();
}

export const useFollowingFresh = () => useSyncExternalStore(freshChanged.on, () => followingFresh);
