import { Bone, HeaderSkeleton, PersonRows, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton back />
      <div className="border-b border-hairline px-4 py-3 sm:px-6">
        <Bone className="h-10 rounded-md" />
      </div>
      <PersonRows rows={6} />
    </Skeleton>
  );
}
