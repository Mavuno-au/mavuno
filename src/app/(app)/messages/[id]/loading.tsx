import { Bone, HeaderSkeleton, Skeleton } from "@/components/shell/skeletons";

// Bubbles sit at the bottom, as in the thread, with the composer under them.
export default function Loading() {
  return (
    <Skeleton className="flex flex-col bg-surface max-md:fixed max-md:inset-x-0 max-md:top-14 max-md:bottom-(--mobile-nav-height) max-md:z-10 max-md:mx-auto max-md:max-w-[620px] md:h-dvh">
      <HeaderSkeleton back meta action />
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 px-4 py-6 sm:px-6">
        {[
          ["w-3/5", "self-start"],
          ["w-2/5", "self-start"],
          ["w-1/2", "self-end"],
          ["w-1/3", "self-start"],
          ["w-3/5", "self-end"],
        ].map(([width, side], index) => (
          <Bone key={index} className={`h-10 rounded-2xl ${width} ${side}`} />
        ))}
      </div>
      <div className="border-t border-hairline px-4 py-3 sm:px-6">
        <Bone className="h-11 rounded-xl" />
      </div>
    </Skeleton>
  );
}
