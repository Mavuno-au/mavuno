"use client";

import { useState, useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};

function readDraft(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, body: string) {
  try {
    if (body.trim()) localStorage.setItem(key, body);
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
  return { body: typed ?? stored, setBody, restored: typed === null && stored !== "" };
}
