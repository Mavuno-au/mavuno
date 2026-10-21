// Personal invite links: mavuno.au/join/<username>. Whoever joins through one
// and the member follow each other (see the invite_links migration).

export const inviteUrl = (origin: string, username: string) => `${origin.replace(/\/$/, "")}/join/${encodeURIComponent(username)}`;

// Written to be pasted into a WhatsApp group as it is. Share sheets get the
// text and the link separately, or some apps would show the link twice.
export const INVITE_TEXT = "Join me on Mavuno, the social network for African Australians. Sign up with my link and we'll follow each other:";
export const inviteMessage = (url: string) => `${INVITE_TEXT} ${url}`;

export const whatsAppLink = (url: string) => `https://wa.me/?text=${encodeURIComponent(inviteMessage(url))}`;
