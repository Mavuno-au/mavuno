"use client";

import { useRouter } from "next/navigation";
import { Composer } from "@/components/post/composer";

export function SpaceComposer({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const router = useRouter();
  return (
    <div className="border-b border-hairline">
      <Composer mode={{ kind: "post", spaceId, placeholder: `Post in ${spaceName}` }} onPosted={() => router.refresh()} />
    </div>
  );
}
