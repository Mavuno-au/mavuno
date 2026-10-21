import { Bone, HeaderSkeleton, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton back meta />
      <div className="aspect-[2/1] w-full animate-pulse border-b border-hairline bg-wash" />
      <section className="grid gap-5 border-b border-hairline px-4 py-5 sm:px-6">
        <div className="grid gap-2">
          <Bone className="h-3 w-28" />
          <Bone className="h-7 w-3/4" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-3">
              <Bone className="size-4 rounded-sm" />
              <Bone className="h-4 w-56" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Bone className="size-10 rounded-full" />
          <Bone className="h-4 w-32" />
        </div>
      </section>
    </Skeleton>
  );
}
