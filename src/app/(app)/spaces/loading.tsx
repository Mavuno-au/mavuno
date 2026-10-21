import { HeaderSkeleton, Skeleton, SpaceRows } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton meta action tabs={3} />
      <SpaceRows />
    </Skeleton>
  );
}
