import { HeaderSkeleton, NotificationRows, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton tabs={5} />
      <NotificationRows />
    </Skeleton>
  );
}
