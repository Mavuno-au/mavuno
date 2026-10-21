import { FilterBarSkeleton, HeaderSkeleton, OpportunityRows, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton meta action tabs={5} />
      <FilterBarSkeleton />
      <OpportunityRows />
    </Skeleton>
  );
}
