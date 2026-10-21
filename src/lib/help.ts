// The questions the Help page answers. Each slug is the answer's address
// (/help#slug), so a notice, a moderator or an email can point at one answer.
// The page owns the answers; this list is what the search palette needs.
export const HELP_SECTIONS = [
  {
    title: "Posting",
    topics: [
      { slug: "sent-for-review", question: "What does \"Sent for review\" mean?", keywords: "pending moderator check approved hidden" },
      { slug: "edit-a-post", question: "Why can't I edit a post?", keywords: "undo delete typo change immutable" },
      { slug: "not-approved", question: "My event or opportunity wasn't approved", keywords: "rejected listing job scholarship fix resubmit" },
    ],
  },
  {
    title: "Safety",
    topics: [
      { slug: "report", question: "How do I report something?", keywords: "abuse scam spam harassment flag esafety" },
      { slug: "mute-block", question: "What's the difference between mute and block?", keywords: "unfollow hide stop seeing" },
      { slug: "message-requests", question: "Why did a message go to requests?", keywords: "dm direct inbox who can message me" },
    ],
  },
  {
    title: "Moderation decisions",
    topics: [
      { slug: "removed", question: "Why was my post removed?", keywords: "notice rule taken down" },
      { slug: "suspended", question: "What does a suspension mean?", keywords: "suspension locked can't post" },
      { slug: "banned", question: "What does a ban mean?", keywords: "permanent sign up again" },
      { slug: "appeal", question: "How do I appeal a decision?", keywords: "mistake wrong review again 30 days" },
    ],
  },
  {
    title: "Age",
    topics: [{ slug: "age", question: "How do you check that I'm 16 or older?", keywords: "under 16 birth date deactivated id minimum age esafety" }],
  },
  {
    title: "Your account and data",
    topics: [
      { slug: "export", question: "How do I download my data?", keywords: "export json copy backup" },
      { slug: "delete-account", question: "How do I delete my account?", keywords: "remove leave close erase" },
      { slug: "location", question: "What do you know about where I am?", keywords: "city gps location photos privacy" },
      { slug: "organisations", question: "How do organisations and teams work?", keywords: "business church association team owner admin editor invitation" },
    ],
  },
  {
    title: "Reaching us",
    topics: [{ slug: "contact", question: "How do I reach a person?", keywords: "email support contact human talk" }],
  },
] as const;

export type HelpTopic = (typeof HELP_SECTIONS)[number]["topics"][number];
export type HelpSlug = HelpTopic["slug"];

export const HELP_TOPICS: readonly HelpTopic[] = HELP_SECTIONS.flatMap((section): readonly HelpTopic[] => section.topics);

// Plain word matching against the question and its keywords: the list is
// short, and someone typing "ban" or "under 16" should land on the answer.
export function findHelp(term: string, limit = 3): HelpTopic[] {
  const words = term.toLowerCase().split(/\s+/).filter((word) => word.length >= 2);
  if (words.length === 0) return [];
  return HELP_TOPICS.filter((topic) => {
    const text = `${topic.question} ${topic.keywords}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }).slice(0, limit);
}
