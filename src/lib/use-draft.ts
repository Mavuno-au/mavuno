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
  return { body: typed ?? stored, setBody, restored: typed === null && stored !== "" };
}
