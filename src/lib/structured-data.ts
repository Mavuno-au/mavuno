import type { Profile } from "@/lib/data/profiles";
import type { Post } from "@/lib/domain";
import { publicEnv } from "@/lib/env";

export const absoluteUrl = (path: string) => new URL(path, publicEnv.siteUrl).href;

const count = (type: string, value: number) => ({ "@type": "InteractionCounter", interactionType: `https://schema.org/${type}`, userInteractionCount: value });

function agent(person: { username: string; displayName: string; accountType: "person" | "organisation" }) {
  return { "@type": person.accountType === "organisation" ? "Organization" : "Person", name: person.displayName, alternateName: `@${person.username}`, url: absoluteUrl(`/@${person.username}`) };
}

// https://schema.org/SocialMediaPosting, as search engines read it for forum and social posts.
export function postJsonLd(post: Post) {
  const url = absoluteUrl(`/@${post.author.username}/posts/${post.id}`);
  return {
    "@context": "https://schema.org",
    "@type": "SocialMediaPosting",
    "@id": url,
    url,
    datePublished: post.createdAt,
    inLanguage: post.language,
    text: post.body,
    author: agent(post.author),
    ...(post.images.length > 0 ? { image: post.images.map((image) => ({ "@type": "ImageObject", url: image.url, ...(image.alt ? { description: image.alt } : {}) })) } : {}),
    ...(post.linkUrl ? { sharedContent: { "@type": "WebPage", url: post.linkUrl } } : {}),
    ...(post.parentId && post.parentUsername ? { commentOf: absoluteUrl(`/@${post.parentUsername}/posts/${post.parentId}`) } : {}),
    interactionStatistic: [count("LikeAction", post.likes), count("CommentAction", post.replies), count("ShareAction", post.quotes)],
  };
}

// https://schema.org/ProfilePage
export function profileJsonLd(profile: Profile) {
  const url = absoluteUrl(`/@${profile.username}`);
  const sameAs = [...(profile.website ? [profile.website] : []), ...profile.links.map((link) => link.url)];
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": url,
    url,
    dateCreated: profile.created_at,
    mainEntity: {
      ...agent({ username: profile.username, displayName: profile.display_name, accountType: profile.account_type }),
      identifier: profile.id,
      ...(profile.bio || profile.headline ? { description: profile.bio || profile.headline } : {}),
      ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
      ...(sameAs.length > 0 ? { sameAs } : {}),
      interactionStatistic: [count("FollowAction", profile.followers_count)],
      agentInteractionStatistic: [count("WriteAction", profile.posts_count), count("FollowAction", profile.following_count)],
    },
  };
}
