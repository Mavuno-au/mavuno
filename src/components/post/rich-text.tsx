import Link from "next/link";
import { cn } from "@/lib/cn";
import { displayUrl, tokenize } from "@/lib/text";

export function RichText({ body, className }: { body: string; className?: string }) {
  return (
    <p className={cn("whitespace-pre-wrap wrap-anywhere", className)}>
      {tokenize(body).map((segment, index) => {
        switch (segment.kind) {
          case "text":
            return segment.text;
          case "mention":
            return (
              <Link key={index} href={`/@${segment.username}`} className="text-primary hover:underline" onClick={(event) => event.stopPropagation()}>
                {segment.text}
              </Link>
            );
          case "topic":
            return (
              <Link key={index} href={`/topics/${segment.topic}`} className="text-primary hover:underline" onClick={(event) => event.stopPropagation()}>
                {segment.text}
              </Link>
            );
          case "url":
            return (
              <a
                key={index}
                href={segment.href}
                title={segment.href}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="text-primary hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {displayUrl(segment.href)}
              </a>
            );
          default: {
            const exhaustive: never = segment;
            return exhaustive;
          }
        }
      })}
    </p>
  );
}
