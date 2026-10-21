import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Placeholders for the loading.tsx of each route. Each one copies the spacing
// of the rows it stands in for, so the page doesn't jump when they arrive,
// and the whole thing fades in after a beat so a fast page never flashes it.

export function Skeleton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-[fade-in_160ms_ease-out_300ms_both]", className)}>
      <p role="status" className="sr-only">
        Loading
      </p>
      <div aria-hidden>{children}</div>
    </div>
  );
}

export function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-wash", className)} />;
}

const Avatar = ({ size = "md", square = false }: { size?: "xs" | "sm" | "md" | "lg" | "xl"; square?: boolean }) => (
  <Bone className={cn({ xs: "size-5", sm: "size-7", md: "size-10", lg: "size-14", xl: "size-20" }[size], square ? "rounded-[28%]" : "rounded-full", "shrink-0")} />
);

const Line = ({ width, className }: { width: string; className?: string }) => <Bone className={cn("h-3.5", width, className)} />;

export function TabsSkeleton({ count }: { count: number }) {
  return (
    <div className="flex">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-1 items-center justify-center py-3.5">
          <Line width={index === 0 ? "w-16" : "w-14"} className="h-4" />
        </div>
      ))}
    </div>
  );
}

// The sticky 56px header every page starts with, with a search field or tabs
// below when the page has them.
export function HeaderSkeleton({ back = false, meta = false, action = false, tabs = 0, search = false, titleHidden = false }: { back?: boolean; meta?: boolean; action?: boolean; tabs?: number; search?: boolean; titleHidden?: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur">
      {titleHidden ? null : (
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {back ? <Bone className="size-5 rounded-md" /> : null}
          <div className="grid flex-1 gap-1.5">
            <Line width="w-32" className="h-4" />
            {meta ? <Line width="w-20" className="h-2.5" /> : null}
          </div>
          {action ? <Bone className="h-8 w-24 rounded-md" /> : null}
        </div>
      )}
      {search ? <Bone className="mx-4 mb-3 h-10 rounded-full sm:mx-6" /> : null}
      {tabs > 0 ? <TabsSkeleton count={tabs} /> : null}
    </header>
  );
}

export function FilterBarSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-hairline px-4 py-3 sm:px-6">
      {Array.from({ length: count }, (_, index) => (
        <Bone key={index} className="h-9 flex-1 rounded-md" />
      ))}
    </div>
  );
}

export function SectionHeadingSkeleton() {
  return (
    <div className="border-b border-hairline bg-shell px-4 py-2 sm:px-6">
      <Line width="w-28" className="h-4" />
    </div>
  );
}

// A post row: avatar, name and handle, two lines of body, the action row.
export function PostRows({ rows = 6, focus = false }: { rows?: number; focus?: boolean }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="border-b border-hairline px-4 py-3 sm:px-6">
      <div className="flex gap-3">
        <Avatar />
        <div className="grid min-w-0 flex-1 gap-2.5 pt-1">
          <div className="flex items-center gap-2">
            <Line width="w-28" />
            <Line width="w-20" className="h-3" />
          </div>
          <Line width="w-full" className={focus ? "h-4" : undefined} />
          <Line width={index % 2 ? "w-3/4" : "w-5/6"} className={focus ? "h-4" : undefined} />
          {focus ? <Line width="w-1/2" className="h-4" /> : null}
          <div className="mt-1 flex gap-8">
            {Array.from({ length: 4 }, (_, action) => (
              <Bone key={action} className="size-4 rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    </div>
  ));
}

export function PersonRows({ rows = 8, compact = false }: { rows?: number; compact?: boolean }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className={compact ? "flex items-center gap-3 py-2" : "flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6"}>
      <Avatar size={compact ? "sm" : "md"} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Line width="w-32" className="h-4" />
        <Line width="w-20" className="h-3" />
        {compact ? null : <Line width="w-48" className="h-3" />}
      </div>
      <Bone className="h-8 w-20 rounded-md" />
    </div>
  ));
}

export function ConversationRows({ rows = 8 }: { rows?: number }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6">
      <Avatar />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Line width="w-36" className="h-4" />
          <Line width="w-8" className="h-3" />
        </div>
        <Line width={index % 3 ? "w-3/4" : "w-1/2"} />
      </div>
    </div>
  ));
}

export function SpaceRows({ rows = 8 }: { rows?: number }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-6">
      <Avatar />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Line width="w-40" className="h-4" />
        <Line width="w-28" className="h-3" />
      </div>
      <Bone className="h-8 w-16 rounded-md" />
    </div>
  ));
}

export function EventRows({ rows = 6 }: { rows?: number }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="flex gap-3 border-b border-hairline px-4 py-3 sm:px-6">
      <div className="grid min-w-0 flex-1 content-start gap-2">
        <Line width="w-32" className="h-3" />
        <Line width="w-3/4" className="h-4" />
        <Line width="w-1/2" />
        <div className="mt-0.5 flex items-center gap-2">
          <Avatar size="xs" />
          <Line width="w-24" className="h-3" />
        </div>
      </div>
      {index % 2 ? <Bone className="size-16 shrink-0 rounded-md sm:size-20" /> : null}
    </div>
  ));
}

export function OpportunityRows({ rows = 8 }: { rows?: number }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="flex gap-3 border-b border-hairline px-4 py-3 sm:px-6">
      <Avatar />
      <div className="grid min-w-0 flex-1 content-start gap-2">
        <Line width="w-3/4" className="h-4" />
        <Line width="w-1/2" />
        <div className="mt-0.5 flex items-center gap-2">
          <Bone className="h-5 w-16 rounded-md" />
          <Line width="w-24" className="h-3" />
        </div>
      </div>
    </div>
  ));
}

export function NotificationRows({ rows = 8 }: { rows?: number }) {
  return Array.from({ length: rows }, (_, index) => (
    <div key={index} className="flex gap-3 border-b border-hairline px-4 py-3 sm:px-6">
      <Bone className="mt-1 size-5 rounded-sm" />
      <div className="grid min-w-0 flex-1 gap-2">
        <Avatar size="sm" />
        <Line width={index % 2 ? "w-2/3" : "w-1/2"} className="h-4" />
        <Line width="w-5/6" />
      </div>
    </div>
  ));
}

// Blocks of a field or paragraph, for forms and pages of text.
export function ProseBlocks({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-6 px-4 py-6 sm:px-6">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid gap-2">
          <Line width="w-40" className="h-4" />
          <Line width="w-full" />
          <Line width={index % 2 ? "w-4/5" : "w-11/12"} />
          <Line width="w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="grid gap-2 bg-surface px-4 py-3">
          <Line width="w-16" className="h-3" />
          <Line width="w-12" className="h-7" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Whole pages, shared by routes that look alike
// ---------------------------------------------------------------------------

export function HomeLoading() {
  return (
    <Skeleton>
      <HeaderSkeleton titleHidden tabs={3} />
      <div className="flex gap-3 border-b border-hairline px-4 py-4 sm:px-6">
        <Avatar />
        <Line width="w-48" className="mt-2.5 h-4" />
      </div>
      <PostRows />
    </Skeleton>
  );
}

export function FeedLoading({ back = false, meta = true }: { back?: boolean; meta?: boolean }) {
  return (
    <Skeleton>
      <HeaderSkeleton back={back} meta={meta} />
      <PostRows />
    </Skeleton>
  );
}

export function ProfileLoading() {
  return (
    <Skeleton>
      <HeaderSkeleton back meta />
      <div className="border-b border-hairline">
        <div className="h-32 animate-pulse bg-wash sm:h-40" />
        <div className="px-4 pb-4 sm:px-6">
          <div className="-mt-10 flex items-end justify-between gap-3">
            <Bone className="size-20 rounded-full border-4 border-surface" />
            <Bone className="h-9 w-24 rounded-md" />
          </div>
          <div className="mt-3 grid gap-2">
            <Line width="w-48" className="h-6" />
            <Line width="w-28" className="h-3" />
          </div>
          <div className="mt-3 grid gap-2">
            <Line width="w-full" />
            <Line width="w-2/3" />
          </div>
          <div className="mt-3 flex gap-4">
            <Line width="w-24" className="h-3" />
            <Line width="w-20" className="h-3" />
          </div>
        </div>
      </div>
      <div className="border-b border-hairline">
        <TabsSkeleton count={3} />
      </div>
      <PostRows rows={4} />
    </Skeleton>
  );
}

export function PostLoading() {
  return (
    <Skeleton>
      <HeaderSkeleton back />
      <PostRows rows={1} focus />
      <PostRows rows={3} />
    </Skeleton>
  );
}

export function ConnectionsLoading() {
  return (
    <Skeleton>
      <HeaderSkeleton back meta tabs={2} />
      <PersonRows />
    </Skeleton>
  );
}

export function PeopleLoading({ search = false, tabs = 0 }: { search?: boolean; tabs?: number }) {
  return (
    <Skeleton>
      <HeaderSkeleton search={search} tabs={tabs} />
      <PersonRows />
    </Skeleton>
  );
}

export function ProseLoading({ back = false }: { back?: boolean }) {
  return (
    <Skeleton>
      <HeaderSkeleton back={back} />
      <ProseBlocks />
    </Skeleton>
  );
}

// Pages under a layout that already draws the header and tabs.
export function FormLoading() {
  return (
    <Skeleton>
      <ProseBlocks count={3} />
    </Skeleton>
  );
}
