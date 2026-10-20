# Product

## Users

African Australians, and the people and organisations around them: community associations, churches and mosques, businesses, students, families and newcomers. They want one place to hear what is happening in their city, find work and opportunities, meet people with shared roots, and talk without the noise of general social networks.

## Purpose

Mavuno ("harvest" in Swahili) is a social network for that community. Members post, follow people and organisations, join city and interest spaces, find events and opportunities, and message each other. Success is people posting here regularly and finding real help: a job, a mentor, a room to rent, a gathering to go to.

## What exists

- **Posts:** text, up to four photos with descriptions, link cards and click-to-play video and audio, polls; replies, quote posts, threads; scheduling up to 30 days ahead.
- **Feeds:** Following, Latest and Trending; spaces, topics, profiles, nearby and saved posts.
- **Profiles:** people and organisations, with city, heritage, languages, interests and optional professional details.
- **Spaces:** city spaces with the city's photo, and interest spaces.
- **Events and opportunities:** jobs, internships, scholarships, grants, mentoring, business and volunteering.
- **Messages:** one to one and groups, with requests, reactions, read receipts and photos.
- **Notifications:** in-app, grouped.
- **Languages:** posts carry their language; members can translate posts.
- **Safety:** mute, block, reports, review after a report (and of new members' content when an admin turns it on), moderation tools.
- **Data:** JSON export and account deletion.

## Rules every feature keeps

- **Posts go up straight away; moderation starts with reports.** Content from someone with a recent report waits for a moderator, and admins can hold new members' content during a wave of spam. Authors always see their own pending content.
- **Posts are immutable.** Create and delete with a 30-second undo; never edit. A deleted post leaves an authorless tombstone so replies survive.
- **Mutes and blocks apply everywhere**: feeds, threads, search, suggestions, notifications and messages.
- **Location is a city, never a point.** Nothing more precise than a city is stored about anyone, and photos are stripped of location data before upload.
- **Store as little as possible.** Settings are private to their owner. Everything about a person is in their export and is erased with their account.
- **The database enforces the rules.** Row level security, explicit grants and database functions decide what each person can read and do, so every client gets the same rules.

## Vocabulary

A post is a **post**, the home timeline is **Following**, a group of people around a place or topic is a **space**, and an organisation's account is run by its **team** (owners, admins, editors). The engagement action is **like**. People **save** posts for later.

## Voice

Plain, warm and direct, in Australian English. Sentence case, no em dashes, no hype words. Say what happens: "Sent for review", "You're going", "Link copied".

## Deliberately excluded

Ads, follower counts as status games, plain reposts without commentary, editing posts, precise location, and email or push notifications for now.
