"use client";

import { useState, useSyncExternalStore } from "react";
import { findPersonalInfo } from "@/lib/personal-info";

const subscribeToNothing = () => () => {};

function readDraft(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

// A draft with a phone number, bank details or the like stays in memory only,
// so it isn't left behind on a shared computer.
function writeDraft(key: string, body: string) {
  try {
    if (body.trim() && findPersonalInfo(body).length === 0) localStorage.setItem(key, body);
    else localStorage.removeItem(key);
  } catch {}
}

// Unsent text kept in this browser under `key` (see lib/browser-data.ts), shown
// again until the person types or clears it. Null keeps nothing.
export function useDraft(key: string | null) {
  const stored = useSyncExternalStore(subscribeToNothing, () => (key ? readDraft(key) : ""), () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const setBody = (value: string) => {
    setTyped(value);
    if (key) writeDraft(key, value);
  };
  const body = typed ?? stored;
  // While a post is on its way the stored copy is set aside, so a reload in
  // the meantime (a redeploy, a phone closing the tab) can't bring back text
  // that was posted. It goes back if posting fails.
  const hold = () => {
    if (key) writeDraft(key, "");
  };
  const keep = () => {
    if (key) writeDraft(key, body);
  };
  return { body, setBody, hold, keep, restored: typed === null && stored !== "" };
}
