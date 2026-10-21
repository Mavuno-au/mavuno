import { Bone, FilterBarSkeleton, HeaderSkeleton, PersonRows, PostRows, SectionHeadingSkeleton, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton meta />
      <div className="flex gap-3 border-b border-hairline px-4 py-3 sm:px-6">
        <Bone className="size-4 rounded-sm" />
        <Bone className="h-3.5 flex-1" />
      </div>
      <FilterBarSkeleton count={3} />
      <SectionHeadingSkeleton />
      <PersonRows rows={3} />
      <SectionHeadingSkeleton />
      <PostRows rows={4} />
    </Skeleton>
  );
}
