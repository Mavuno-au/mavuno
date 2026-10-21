"use client";

import { SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Composer } from "@/components/post/composer";
import { useCompose } from "@/components/shell/compose";
import { cn } from "@/lib/cn";

// Scrolling less than this either way doesn't move the button, so small jitters don't flicker it.
const SCROLL_SLACK = 8;

export function HomeComposer() {
  const router = useRouter();
  const { open } = useCompose();
  const ref = useRef<HTMLDivElement>(null);
  // Starts in view so the button never flashes in over a composer that is on screen.
  const [inView, setInView] = useState(true);
  // Out of the way while reading down the feed; back as soon as you scroll up.
  const [scrollingDown, setScrollingDown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // The page's sticky header (the feed tabs) covers the top of the screen.
    const covered = Math.round(document.querySelector("main header")?.getBoundingClientRect().height ?? 0);
    const observer = new IntersectionObserver(([entry]) => setInView((entry?.intersectionRatio ?? 1) >= 0.5), {
      rootMargin: `-${covered}px 0px 0px 0px`,
      threshold: 0.5,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < SCROLL_SLACK) return;
      setScrollingDown(y > last);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const hidden = inView || scrollingDown;

  return (
    <>
      <div ref={ref} className="border-b border-hairline">
        <Composer mode={{ kind: "post" }} onPosted={() => router.refresh()} />
      </div>
      <button
        type="button"
        onClick={() => open()}
        aria-label="New post"
        inert={hidden}
        className={cn(
          "fixed right-4 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-20 [:root[data-keyboard-open]_&]:hidden flex size-14 items-center justify-center rounded-full bg-primary text-primary-ink shadow-lg transition-[opacity,translate] duration-200 hover:bg-primary-hover md:hidden motion-reduce:transition-none",
          hidden ? "pointer-events-none translate-y-4 opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <SquarePen className="size-6" aria-hidden />
      </button>
    </>
  );
}
