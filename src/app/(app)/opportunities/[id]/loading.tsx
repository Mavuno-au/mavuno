import { Bone, HeaderSkeleton, ProseBlocks, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton back meta />
      <section className="grid gap-3 border-b border-hairline px-4 py-5 sm:px-6">
        <Bone className="h-5 w-20 rounded-md" />
        <Bone className="h-7 w-3/4" />
        <Bone className="h-4 w-1/2" />
      </section>
      <ProseBlocks count={2} />
    </Skeleton>
  );
}
