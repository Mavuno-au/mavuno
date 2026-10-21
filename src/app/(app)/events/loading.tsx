import { EventRows, FilterBarSkeleton, HeaderSkeleton, SectionHeadingSkeleton, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton meta action />
      <FilterBarSkeleton />
      <SectionHeadingSkeleton />
      <EventRows rows={3} />
      <SectionHeadingSkeleton />
      <EventRows rows={3} />
    </Skeleton>
  );
}
