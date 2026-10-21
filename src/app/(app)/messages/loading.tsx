import { ConversationRows, HeaderSkeleton, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton action tabs={3} />
      <ConversationRows />
    </Skeleton>
  );
}
