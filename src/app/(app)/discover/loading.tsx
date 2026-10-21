import { Bone, HeaderSkeleton, PersonRows, PostRows, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <Skeleton>
      <HeaderSkeleton search tabs={4} />
      <section className="border-b border-hairline px-4 py-5 sm:px-6">
        <Bone className="mb-3 h-5 w-44" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Bone key={index} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </section>
      <section className="border-b border-hairline px-4 py-5 sm:px-6">
        <Bone className="mb-3 h-5 w-32" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Bone key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      </section>
      <section className="border-b border-hairline px-4 pt-5 pb-2 sm:px-6">
        <Bone className="mb-1 h-5 w-32" />
        <PersonRows rows={4} compact />
      </section>
      <PostRows rows={3} />
    </Skeleton>
  );
}
