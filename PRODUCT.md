# Product

## Users

African Australians, and the people and organisations around them: community associations, churches and mosques, businesses, students, families and newcomers. They want one place to hear what is happening in their city, find work and opportunities, meet people with shared roots, and talk without the noise of general social networks.

## Purpose

Mavuno ("harvest" in Swahili) is a social network for that community. Members post, follow people and organisations, join city and interest spaces, find events and opportunities, and message each other. Success is people posting here regularly and finding real help: a job, a mentor, a room to rent, a gathering to go to.

## What exists

- **Posts:** text, up to four photos with descriptions, link cards and click-to-play video and audio, polls; replies, quote posts, threads; scheduling up to 30 days ahead. Mentions suggest the people in the conversation first. Before a post with a phone number, email address, bank, card, tax file or Medicare number goes up, the writer is asked to check, and such drafts are never saved in the browser. Authors can see who liked their posts; nobody else can.
- **Feeds:** Following, Latest and Trending; spaces, topics, profiles, nearby and saved posts. Each post shows its newest replies (none, 3 or 5, chosen in Appearance). Trending is drawn afresh on each visit, weighted by how much conversation a post has.
- **Profiles:** people and organisations, with city, heritage, languages, interests and optional professional details. Resting the mouse on a name, or tabbing to it, opens a profile card with a Follow button.
- **Spaces:** city spaces with the city's photo, and interest spaces.
- **Events and opportunities:** jobs, internships, scholarships, grants, mentoring, business and volunteering.
- **Messages:** one to one and groups, with requests, reactions, read receipts, photos and link cards.
- **Notifications:** in-app, grouped.
- **Invites:** each member has a link, mavuno.au/join/<username>, to share or send on WhatsApp. Someone who joins with it and the member follow each other, and the member is told so they can say welcome. Who invited whom is seen only by those two. No rewards, leaderboards or limits.
- **Languages:** posts carry their language; members can translate posts.
- **Safety:** mute, block, reports, review after a report (and of new members' content when an admin turns it on), the community rules accepted before the first post, moderation tools: removals that name the rule, suspensions from an hour to 30 days, bans that outlive the account, appeals, and a record of every decision.
- **Data:** JSON export and account deletion.
- **Help:** one article per question at /help/<slug>, grouped by category, with numbered steps that name the real buttons. Section links are the heading (/help/appeals#how-to-appeal), so a notice or an email can point at one. Searchable on the Help page and from the search palette. No ticket system: an email address and a reply within 7 days.

## Rules every feature keeps

- **Posts go up straight away; moderation starts with reports.** Members read and accept the community rules once before their first post. Reports carry weight when they come from members who have been around a while and are in good standing: three of those hide a post, and one puts its author's new content in front of a moderator for a week. Admins can hold new members' content during a wave of spam. Authors always see their own pending content.
- **Posts are immutable.** Create and delete with a 30-second undo; never edit. A deleted post leaves an authorless tombstone so replies survive.
- **Mutes and blocks apply everywhere**: feeds, threads, search, suggestions, notifications and messages.
- **Location is a city, never a point.** Nothing more precise than a city is stored about anyone, and photos are re-encoded on the server, without location data, before they are stored.
- **Store as little as possible.** Settings are private to their owner. Everything about a person is in their export and is erased with their account, with one exception: when an account is banned, or deleted while suspended, a peppered hash of its email address and sign-in stays until the ban or suspension would have ended, so the same person can't simply sign up again. The hash is all that stays, and nothing can be read back from it.
- **The database enforces the rules.** Row level security, explicit grants and database functions decide what each person can read and do, so every client gets the same rules.

## Vocabulary

A post is a **post**, the home timeline is **Following**, a group of people around a place or topic is a **space**, and an organisation's account is run by its **team** (owners, admins, editors). The engagement action is **like**. People **save** posts for later.

## Voice

Plain, warm and direct, in Australian English. Sentence case, no em dashes, no hype words. Say what happens: "Sent for review", "You're going", "Link copied".

## Deliberately excluded

Ads, follower counts as status games, plain reposts without commentary, editing posts, precise location, and email or push notifications for now.
