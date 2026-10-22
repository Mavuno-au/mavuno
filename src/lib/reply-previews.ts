import { z } from "zod";

// How many of the newest replies show under each post in a feed. Kept in a
// cookie, like Who to follow, so the server loads them with the page.
export const REPLY_PREVIEWS_COOKIE = "reply_previews";
export const REPLY_PREVIEW_CHOICES = [0, 3, 5] as const;
export type ReplyPreviewCount = (typeof REPLY_PREVIEW_CHOICES)[number];

export const DEFAULT_REPLY_PREVIEWS: ReplyPreviewCount = 3;
const YEAR = 60 * 60 * 24 * 365;

const choice = z.union([z.literal("0"), z.literal("3"), z.literal("5")]).transform((value) => REPLY_PREVIEW_CHOICES.find((count) => String(count) === value) ?? DEFAULT_REPLY_PREVIEWS);

export const parseReplyPreviewCount = (value: string | undefined): ReplyPreviewCount => choice.catch(DEFAULT_REPLY_PREVIEWS).parse(value);

export function rememberReplyPreviewCount(count: ReplyPreviewCount) {
  document.cookie = `${REPLY_PREVIEWS_COOKIE}=${count}; path=/; max-age=${YEAR}; samesite=lax`;
}
