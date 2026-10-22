import { createContext, use, useEffect, useState, type ReactNode } from "react";

// The website renders in Sydney time until the browser takes over; the app
// knows the reader's own zone from the start.
export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const NowContext = createContext(Date.now());

// One clock for the whole app, so "5m" becomes "6m" without a timer per row.
export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return <NowContext value={now}>{children}</NowContext>;
}

export const useNow = () => use(NowContext);
