"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { REPLY_PREVIEW_CHOICES, rememberReplyPreviewCount, type ReplyPreviewCount } from "@/lib/reply-previews";

const label = (count: ReplyPreviewCount) => (count === 0 ? "None" : String(count));

export function ReplyPreviewPicker({ count: initial }: { count: ReplyPreviewCount }) {
  const router = useRouter();
  const [count, setCount] = useState(initial);
  return (
    <fieldset>
      <legend className="sr-only">Replies under each post</legend>
      <div className="grid grid-cols-3 gap-2">
        {REPLY_PREVIEW_CHOICES.map((option) => (
          <label
            key={option}
            className={cn(
              "flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 font-mono text-sm font-medium tabular transition-colors has-focus-visible:ring-2 has-focus-visible:ring-primary",
              count === option ? "border-primary bg-primary-soft text-primary" : "border-rail text-ink hover:bg-wash",
            )}
          >
            <input
              type="radio"
              name="reply-previews"
              className="sr-only"
              checked={count === option}
              onChange={() => {
                setCount(option);
                rememberReplyPreviewCount(option);
                router.refresh();
              }}
            />
            {label(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
