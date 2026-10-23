import { createContext, use, useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Poll, Post } from "@/lib/domain";

// What the viewer has changed since a post or profile was read: a like, a
// save, a vote, a deletion, a follow. Rows are read once per list, and the same post can sit in several
// lists, so the change is kept here and laid over every row that shows it,
// as Bluesky's post shadow does. A count is worked out from the change rather
// than stored, so a row read again after the change doesn't count it twice.

type Store<T> = {
  get: (id: string) => T | undefined;
  set: (id: string, value: T) => void;
  subscribe: (id: string, listener: () => void) => () => void;
};

function createStore<T>(): Store<T> {
  const values = new Map<string, T>();
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (id) => values.get(id),
    set(id, value) {
      values.set(id, value);
      for (const listener of listeners.get(id) ?? []) listener();
    },
    subscribe(id, listener) {
      const set = listeners.get(id) ?? new Set();
      set.add(listener);
      listeners.set(id, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },
  };
}

// `deleted` hides a post the viewer deleted, until Undo or for good.
type PostShadow = { liked?: boolean; saved?: boolean; poll?: Poll; deleted?: boolean };
type Shadows = { posts: Store<PostShadow>; profiles: Store<{ following: boolean }> };

const createShadows = (): Shadows => ({ posts: createStore(), profiles: createStore() });

const ShadowContext = createContext<Shadows>(createShadows());

// Mounted once per signed-in member, so one person's likes never show for the next.
export function ShadowProvider({ children }: { children: ReactNode }) {
  const [shadows] = useState(createShadows);
  return <ShadowContext value={shadows}>{children}</ShadowContext>;
}

function useStored<T>(store: Store<T>, id: string) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(id, listener), [store, id]);
  return useSyncExternalStore(subscribe, () => store.get(id));
}

// A count moves by one when the change differs from what the row said.
const adjusted = (total: number, was: boolean, now: boolean) => Math.max(total + (now ? 1 : 0) - (was ? 1 : 0), 0);

export function usePostShadow(post: Post): Post {
  const shadow = useStored(use(ShadowContext).posts, post.id);
  if (!shadow) return post;
  const liked = shadow.liked ?? post.liked;
  return { ...post, liked, likes: adjusted(post.likes, post.liked, liked), saved: shadow.saved ?? post.saved, poll: shadow.poll ?? post.poll };
}

// Whether the viewer deleted this post since it was read.
export function usePostDeleted(postId: string) {
  return useStored(use(ShadowContext).posts, postId)?.deleted === true;
}

export function useProfileShadow(id: string, read: { following: boolean; followers: number }) {
  const shadow = useStored(use(ShadowContext).profiles, id);
  if (!shadow || shadow.following === read.following) return read;
  return { following: shadow.following, followers: adjusted(read.followers, read.following, shadow.following) };
}

// Which of these people the viewer has followed since they were read, from
// anywhere in the app: suggestions leave out someone once followed.
export function useFollowedAmong(ids: readonly string[]): ReadonlySet<string> {
  const { profiles } = use(ShadowContext);
  const key = ids.join(",");
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = key.split(",").filter(Boolean).map((id) => profiles.subscribe(id, listener));
      return () => stops.forEach((stop) => stop());
    },
    [profiles, key],
  );
  const followed = useSyncExternalStore(subscribe, () =>
    key
      .split(",")
      .filter((id) => id && profiles.get(id)?.following === true)
      .join(","),
  );
  return useMemo(() => new Set(followed.split(",").filter(Boolean)), [followed]);
}

export function useShadowWriter() {
  const { posts, profiles } = use(ShadowContext);
  const change = (postId: string, value: PostShadow) => posts.set(postId, { ...posts.get(postId), ...value });
  return {
    setLiked: (postId: string, liked: boolean) => change(postId, { liked }),
    setSaved: (postId: string, saved: boolean) => change(postId, { saved }),
    setPoll: (postId: string, poll: Poll) => change(postId, { poll }),
    setDeleted: (postId: string, deleted: boolean) => change(postId, { deleted }),
    setFollowing: (profileId: string, following: boolean) => profiles.set(profileId, { following }),
  };
}
