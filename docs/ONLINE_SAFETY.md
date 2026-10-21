# Online safety codes: risk assessment

Mavuno is a social media service under the *Online Safety Act 2021*. Two sets of industry codes apply to it:

- **Phase 1**: the Social Media Services Online Safety Code (Class 1A and Class 1B material), in force since 16 December 2023. It covers the most harmful material: child sexual exploitation material, pro-terror material, and crime, violence and drug-related material.
- **Phase 2**: the social media code for age-restricted material (Class 1C and Class 2, such as online pornography, high-impact violence, and self-harm and suicide material), registered on 9 September 2025 and in force since 9 March 2026.

The codes ask each provider to assess its own risk and take the compliance measures for its tier. This is our assessment. Check it against the registered code text before relying on it; the summary here is ours, not eSafety's.

Last reviewed: 21 October 2026. Next review: October 2027, or sooner (see Review).

## The service

- Members are people and organisations in African Australian communities, almost all in Australia. Accounts are for people 16 and older (`docs/AGE_ASSURANCE.md`).
- Public posts with up to four photos, link cards, polls, replies and quotes; profiles; city and interest spaces; events and opportunities. Public content can be read without an account.
- **Private messages**, one to one and in groups, with photos. This is why Mavuno is not a low-risk service by default: private messaging between people who don't know each other is the main way grooming, sextortion and the sharing of child sexual exploitation material happen.
- No ads, no algorithmic recommendations beyond Following, Latest, Trending and "who to follow", no live streaming, no anonymous accounts without an email address, no end-to-end encryption (moderators can see a reported message).

## Phase 1 risk assessment (Class 1A and 1B)

| Factor | Our position | Effect on risk |
|---|---|---|
| Purpose | Community, jobs and events for adults | Lowers |
| Size | Small, a single country | Lowers |
| Age of users | 16 and older, with layered age checks | Lowers |
| Private messaging with strangers | Yes, but limited: message requests, a daily cap on requests, "who can message you" settings, block | Raises |
| Images | Yes, in posts and messages; location data stripped | Raises |
| Review | Posts go public straight away. Posts, events and opportunities from members without a track record are checked by a moderation model and held if it flags them; a report from a member with standing puts the author's new content in front of a moderator for a week; three such reports hide a post; admins can hold all new members' posts during a wave of spam | Lowers |
| Discoverability | City-level only, never precise location | Lowers |

**Our assessment: Tier 2.** Messaging and images mean we can't claim the lowest tier, and the size, the adult audience, the automatic check on members without a track record, holds after reports, and the ability to switch pre-moderation on keep us out of the highest. We apply the Tier 2 minimum compliance measures, and several Tier 1 ones where they cost little (the automatic check, rate limits on contact with strangers, the option of pre-moderation).

### What we do

**Terms that prohibit the material.** The [terms](/terms) (section 4 and the community rules) and the [community rules](/rules) (rule 1: violence and terrorism; rule 2: sexual content, anything sexual involving under-18s, intimate images, self-harm, gore, weapons and drugs) prohibit Class 1A and 1B material, and say what happens when they're broken. Every member reads and accepts the five rules before their first post, event or opportunity; the database refuses those until they have (`profile_settings.rules_accepted_at`).

**Ways to report.** Every post, reply, profile, message, event, opportunity and space has Report in its menu. Reasons include sexual content, violence or threats, intimate images shared without consent, someone under 16, and legal complaints. After a report, people are told they can go to eSafety if serious abuse isn't dealt with within 48 hours, and to go to eSafety straight away for intimate images.

**Acting on reports.** Moderators see reports grouped and oldest first (Moderation → Reports), with a copy of reported messages and how many reports come from members with standing (a member for a week, something published, not suspended, no report of theirs dismissed recently). Three such reports hide a post until a moderator looks, and one puts the author's new content in front of a moderator for a week; reports from throwaway accounts are shown but hold nothing, so reporting can't be used to silence people. Moderators remove content, suspend accounts (from an hour to 30 days; a second suspension adds to the first), ban accounts and deactivate accounts of under-16s, from a report or from Moderation → People by username. Every removal, suspension and ban names the rule it was under and links to an appeal, which a different moderator reviews within 7 days; the People tab looks a decision up by its number, shows each person's past decisions and who made them, lifts suspensions, and restores what a wrong decision removed. A ban hides everything the person published, cancels their scheduled posts and outlives the account: a peppered hash of the email address and sign-in stays, and Supabase Auth refuses a sign-up that matches it.

**The most serious material.** Child sexual exploitation material and pro-terror material are removed straight away, the account is banned, and we report it to the AFP-led Australian Centre to Counter Child Exploitation (ACCCE) or to police. We comply with eSafety removal notices within 24 hours. Moderators are told not to download or forward such material.

**Safety by design.** Message requests from people you don't follow, limits on new requests per day, the option to accept messages from nobody or only people you follow, mute and block that apply everywhere, photos re-encoded to remove location data, city-level location only. When `OPENAI_API_KEY` is set, posts, events and opportunities from members without a track record (a member for under a week, fewer than three things published, or reported in the past week), and their photos, are checked by OpenAI's moderation model whichever way they were created, and anything it flags goes back to the review queue with the categories it found. It never removes anything: a moderator decides, because the model is weaker in Swahili, Somali and Amharic.

**Accountability.** Every moderation decision is recorded with who made it, whom it was about, the rule and the reason (`moderation_actions`, read by moderators as `moderation_log`), admins see how many reports are open and who is suspended at `/operations` and Moderation → People, and we will answer eSafety's requests for information about how the codes are being met.

## Phase 2 risk assessment (age-restricted material)

- **What is restricted:** online pornography, high-impact sexual and violent material, and self-harm, suicide and disordered eating material.
- **Our position:** Mavuno doesn't allow any of it. Community rule 2 prohibits sexual content, self-harm and suicide content, eating disorder content and graphic violence. There is no "adult" setting or opt-in.
- **Who could see it:** members are 16 or older, but public posts can be read without an account, including by children. So the risk we manage is restricted material being posted and staying up, not deliberate access.
- **Measures:** prohibition in the rules, accepted before the first post; the automatic check on members without a track record; reports with sexual content, violence and self-harm reasons; removal when found; and accounts suspended or banned for repeat or serious breaches. We don't offer search for or recommend such material, and Trending only counts published posts.

**Our assessment: low risk.** Because the material is prohibited and removed rather than restricted, we don't need age-gated access to content beyond the account age checks.

## Review

- **Every year, each October**, an admin re-reads the registered codes and eSafety's guidance, re-runs this assessment and updates both docs.
- **Straight away** if we add a feature that changes the risk (live audio or video, public group chats, end-to-end encryption, recommendations), if eSafety sends a notice or updates its guidance, or if reports show a new pattern of harm.
- **Every quarter**, an admin checks from `/operations` and the report queue how many reports are open and how old the oldest is, how many removals were appealed and how many appeals succeeded.
