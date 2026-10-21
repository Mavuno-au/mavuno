"use client";

import { createContext, useContext } from "react";

// What a post inside a feed can change about the feed in place. Reloading the
// page instead would drop the pages loaded so far and the reader's place.
export type FeedActions = {
  // Authors muted or blocked since the feed loaded.
  hidden: ReadonlySet<string>;
  hideAuthor: (authorId: string, relation: "mute" | "block") => void;
  pinChanged: (authorId: string) => void;
};

export const FeedContext = createContext<FeedActions | null>(null);

export const useFeedActions = () => useContext(FeedContext);
