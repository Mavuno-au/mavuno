import { HeaderSkeleton, PostRows, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton back search tabs={2} />
      <PostRows />
    </Skeleton>
  );
}
