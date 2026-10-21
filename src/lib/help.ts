// The Help articles: what the home page lists and the search palette finds.
// Each article lives at /help/<slug>; its words are in src/app/(app)/help.
export const HELP_CATEGORIES = [
  { key: "posting", title: "Posting", summary: "Posts, review, and events and opportunities." },
  { key: "safety", title: "Safety", summary: "Reporting, muting, blocking and messages from strangers." },
  { key: "decisions", title: "Moderation decisions", summary: "Removals, suspensions, bans and appeals." },
  { key: "account", title: "Your account", summary: "The age check, your data, deleting your account and organisations." },
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number]["key"];

export const HELP_ARTICLES = [
  { slug: "review", category: "posting", title: "About posts sent for review", summary: "Why a post waits for a moderator, and how long it takes.", keywords: "sent for review pending moderator approved hidden held" },
  { slug: "deleting-posts", category: "posting", title: "How to delete a post", summary: "Deleting, undoing, and why posts can't be edited.", keywords: "edit typo change undo mistake" },
  { slug: "listings", category: "posting", title: "About event and opportunity review", summary: "What a listing needs, and what to do if it isn't approved.", keywords: "event opportunity job scholarship listing rejected not approved edit" },
  { slug: "reporting", category: "safety", title: "How to report a post, profile or message", summary: "What happens after you report, and when to go to eSafety.", keywords: "report abuse scam spam harassment esafety flag" },
  { slug: "mute-and-block", category: "safety", title: "How to mute or block someone", summary: "What each one hides, and how to undo it.", keywords: "mute block unmute unblock hide stop seeing" },
  { slug: "message-requests", category: "safety", title: "About message requests", summary: "Messages from people you don't follow, and who can message you.", keywords: "message dm request inbox accept decline privacy" },
  { slug: "removed-posts", category: "decisions", title: "About removed posts", summary: "The notice you get, and what comes next.", keywords: "removed taken down notice rule deleted by moderator" },
  { slug: "suspensions", category: "decisions", title: "About suspended accounts", summary: "How long a suspension lasts and what you can still do.", keywords: "suspended suspension locked can't post" },
  { slug: "bans", category: "decisions", title: "About banned accounts", summary: "What a ban means and why it outlives the account.", keywords: "banned ban permanent sign up again" },
  { slug: "appeals", category: "decisions", title: "How to appeal a decision", summary: "Ask a different moderator to look again, within 30 days.", keywords: "appeal mistake wrong review again" },
  { slug: "age-check", category: "account", title: "About the age check", summary: "Why Mavuno is 16 and over, and how a review works.", keywords: "age under 16 birth date deactivated id esafety minimum" },
  { slug: "download-your-data", category: "account", title: "How to download your data", summary: "A copy of everything Mavuno holds about you.", keywords: "export download data json copy backup" },
  { slug: "delete-your-account", category: "account", title: "How to delete your account", summary: "What's deleted, what stays, and the one exception.", keywords: "delete account remove close leave erase" },
  { slug: "location-and-photos", category: "account", title: "About location and photos", summary: "Mavuno knows your city and nothing more precise.", keywords: "location city gps nearby photos privacy" },
  { slug: "organisations", category: "account", title: "About organisations and teams", summary: "Run an organisation's profile with other people.", keywords: "organisation business church association team owner admin editor invitation" },
  { slug: "contact", category: "account", title: "How to contact Mavuno", summary: "Email a person. We aim to reply within 7 days.", keywords: "contact email support human talk security" },
] as const satisfies readonly { slug: string; category: HelpCategory; title: string; summary: string; keywords: string }[];

export type HelpArticle = (typeof HELP_ARTICLES)[number];
export type HelpSlug = HelpArticle["slug"];

export const helpArticle = (slug: string): HelpArticle | undefined => HELP_ARTICLES.find((article) => article.slug === slug);

export const helpHref = (slug: HelpSlug, heading?: string) => `/help/${slug}${heading ? `#${anchorFor(heading)}` : ""}`;

// A section's address is its heading, so a link reads like what it points at:
// /help/appeals#how-to-appeal.
export function anchorFor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Words people put around a question ("how do I delete my account") that
// say nothing about which article they want.
const FILLER = new Set(["how", "do", "does", "can", "is", "are", "my", "me", "the", "to", "an", "of", "on", "in", "what", "why", "when", "where", "who", "it", "get", "about"]);

// Plain word matching against the title, summary and keywords: the list is
// short, and someone typing "ban" or "under 16" should land on the article.
export function findHelp(term: string, limit = 4): HelpArticle[] {
  const words = term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2 && !FILLER.has(word));
  if (words.length === 0) return [];
  return HELP_ARTICLES.filter((article) => {
    const text = `${article.title} ${article.summary} ${article.keywords}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }).slice(0, limit);
}
