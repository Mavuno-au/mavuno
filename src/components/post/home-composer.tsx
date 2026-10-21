"use client";

import { SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Composer } from "@/components/post/composer";
import { useCompose } from "@/components/shell/compose";
import { cn } from "@/lib/cn";

// The sticky mobile header, page header and tabs cover about this much of the top of the screen.
const COVERED_TOP = 160;

export function HomeComposer() {
  const router = useRouter();
  const { open } = useCompose();
  const ref = useRef<HTMLDivElement>(null);
  // Starts in view so the button never flashes in over a composer that is on screen.
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView((entry?.intersectionRatio ?? 1) >= 0.5), {
      rootMargin: `-${COVERED_TOP}px 0px 0px 0px`,
      threshold: 0.5,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={ref} className="border-b border-hairline">
        <Composer mode={{ kind: "post" }} onPosted={() => router.refresh()} />
      </div>
      <button
        type="button"
        onClick={() => open()}
        aria-label="New post"
        inert={inView}
        className={cn(
          "fixed right-4 bottom-[calc(var(--mobile-nav-height)+0.75rem)] z-20 [:root[data-keyboard-open]_&]:hidden flex size-14 items-center justify-center rounded-full bg-primary text-primary-ink shadow-lg transition-[opacity,scale] duration-200 hover:bg-primary-hover md:hidden motion-reduce:transition-none",
          inView ? "pointer-events-none scale-75 opacity-0" : "scale-100 opacity-100",
        )}
      >
        <SquarePen className="size-6" aria-hidden />
      </button>
    </>
  );
}
