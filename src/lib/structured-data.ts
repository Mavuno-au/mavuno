import type { CommunityEvent } from "@/lib/data/community";
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

// https://schema.org/Organization and https://schema.org/WebSite, on the home
// page, so search engines know the site's name, logo and owner.
export function siteJsonLd() {
  const url = absoluteUrl("/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${url}#organization`,
        name: "Mavuno",
        url,
        logo: absoluteUrl("/brand/mavuno-app-icon-4096.png"),
        description: "The social network for African Australians.",
        sameAs: ["https://github.com/Mavuno-au/mavuno"],
      },
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: "Mavuno",
        alternateName: "Mavuno, the social network for African Australians",
        url,
        inLanguage: "en-AU",
        publisher: { "@id": `${url}#organization` },
      },
    ],
  };
}

const ATTENDANCE: Record<CommunityEvent["format"], string> = {
  in_person: "https://schema.org/OfflineEventAttendanceMode",
  online: "https://schema.org/OnlineEventAttendanceMode",
  hybrid: "https://schema.org/MixedEventAttendanceMode",
};

// https://developers.google.com/search/docs/appearance/structured-data/event
// The online link is only shared with people going, so the virtual location
// points at the event's page instead.
export function eventJsonLd(event: CommunityEvent) {
  const url = absoluteUrl(`/events/${event.id}`);
  const place = {
    "@type": "Place",
    name: event.venue ?? event.city ?? "Australia",
    address: {
      "@type": "PostalAddress",
      ...(event.address ? { streetAddress: event.address } : {}),
      ...(event.city ? { addressLocality: event.city } : {}),
      addressCountry: "AU",
    },
  };
  const online = { "@type": "VirtualLocation", url };
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": url,
    url,
    name: event.title,
    description: event.description.slice(0, 500),
    startDate: event.startsAt,
    ...(event.endsAt ? { endDate: event.endsAt } : {}),
    eventStatus: event.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: ATTENDANCE[event.format],
    location: event.format === "online" ? online : event.format === "hybrid" ? [place, online] : place,
    ...(event.coverUrl ? { image: [event.coverUrl] } : {}),
    organizer: agent(event.host),
    ...(event.free || event.ticketUrl
      ? { offers: { "@type": "Offer", url: event.ticketUrl ?? url, ...(event.free ? { price: 0, priceCurrency: "AUD" } : {}), availability: "https://schema.org/InStock" } }
      : {}),
  };
}

// https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
// The last crumb is the page itself, so it carries no link.
export function breadcrumbJsonLd(trail: Array<{ name: string; path?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      ...(crumb.path ? { item: absoluteUrl(crumb.path) } : {}),
    })),
  };
}
