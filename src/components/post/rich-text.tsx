import Link from "next/link";
import { cn } from "@/lib/cn";
import { displayUrl, tokenize } from "@/lib/text";

// Direction follows the first strong character, so Arabic and Tigrinya run
// right to left. Links are bidi-isolated so a trailing full stop or comma lands
// beside the link rather than at the far end of the line.
const link = "text-primary hover:underline [unicode-bidi:isolate]";

export function RichText({ body, className }: { body: string; className?: string }) {
  return (
    <p dir="auto" className={cn("whitespace-pre-wrap wrap-anywhere", className)}>
      {tokenize(body).map((segment, index) => {
        switch (segment.kind) {
          case "text":
            return segment.text;
          case "mention":
            return (
              <Link key={index} href={`/@${segment.username}`} className={link} onClick={(event) => event.stopPropagation()}>
                {segment.text}
              </Link>
            );
          case "topic":
            return (
              <Link key={index} href={`/topics/${segment.topic}`} className={link} onClick={(event) => event.stopPropagation()}>
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
                className={link}
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
