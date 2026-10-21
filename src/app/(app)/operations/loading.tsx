import { Bone, Skeleton, StatGridSkeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      {Array.from({ length: 3 }, (_, index) => (
        <section key={index} className="border-b border-hairline px-4 py-5 sm:px-6">
          <Bone className="mb-3 h-5 w-36" />
          <StatGridSkeleton />
        </section>
      ))}
    </Skeleton>
  );
}
