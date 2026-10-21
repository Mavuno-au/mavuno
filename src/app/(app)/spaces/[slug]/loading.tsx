import { Bone, HeaderSkeleton, PostRows, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton back meta />
      <section className="border-b border-hairline px-4 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <Bone className="size-14 rounded-xl" />
          <div className="grid flex-1 gap-2 pt-1">
            <Bone className="h-5 w-40" />
            <Bone className="h-3 w-28" />
          </div>
          <Bone className="h-9 w-20 rounded-md" />
        </div>
        <div className="mt-4 grid gap-2">
          <Bone className="h-3.5 w-full" />
          <Bone className="h-3.5 w-2/3" />
        </div>
      </section>
      <PostRows rows={5} />
    </Skeleton>
  );
}
