# Full review, 23 to 24 October 2026

A review of the whole codebase: `src/app`, `src/app/actions`, `src/components`, `src/lib`, `supabase/migrations` (policies, grants, functions, triggers, jobs), `mobile/src` and `scripts/`. It was compared with two open-source projects: Bluesky's React Native app (`bluesky-social/social-app`) for the phone app, and a Laravel social network for the website and database.

## How it was done

- Eight read-only reviewers, one per area, each reading every file in its slice. Database reviewers judged each function by its final definition after all migrations, from a dump of the schema built in an embedded Postgres (PGlite), and proved findings by acting as different members against the real migrations.
- Each fix was checked against the code before it was made. Database fixes went into five new migrations, each with tests in `scripts/test-db.mjs`; for the messaging fixes, the new tests were run without the migration first and failed. Shared helpers got unit tests.
- The app was not run on a device or simulator (the Mac's only simulator was in use). App fixes are checked by types, lint and reading the libraries they rely on.

Severity is the effect on members: **critical** (data or safety exposed widely), **high** (a core flow broken or private data exposed), **medium** (a real bug with a narrower path), **low** (an edge case, a small gap or polish). Each entry is a **bug** or a **cleanup**.

## Summary

Entries below, by severity (a low entry sometimes groups several small findings in one place):

| | Fixed | Open |
|---|---|---|
| High | 10 | 0 |
| Medium | 38 | 6 |
| Low | 43 | 21 |

Open items are listed at the end with why they're open: a product decision, or a setting outside the code.

---

## Fixed

### High

**bug high: The app retried a failed "load more" in a loop, with no tap.**
`mobile/src/post/feed-list.tsx:78`, `mobile/src/ui/list.tsx:80`, `mobile/src/app/(tabs)/…/post/[id].tsx:262`, `mobile/src/app/conversation/[id].tsx:442`. Offline or on a server error at the end of any feed, list, thread or conversation, the footer changed height when the page failed, FlatList fired `onEndReached` again, and the page was requested again as fast as it failed. The same class as the push-token loop fixed in PR 17. Reference: Bluesky `src/view/com/posts/PostFeed.tsx` (`if (isFetching || !hasNextPage || isError) return`). Fixed in 94aa12d; older messages gained the Try again row they lacked.

**bug high: Anyone, guests and blocked people included, could list every event a member was going to, with the address and time.**
`supabase/migrations/20261020060929_rls_initplan_and_foreign_key_indexes.sql:31` (RSVP policy open to everyone). Hana, blocked by Kofi, could query `event_rsvps` for Kofi's RSVPs and get each event's address and start time; the going list on an event ignored blocks and mutes. Breaks "location is a city, never a point" and "blocks apply everywhere". Reference: none (product rules). Fixed in 0cbd796: RSVPs are the member's own, hosts and moderators see their event's, and `event_attendees` gives members the going list without blocked or muted people.

**bug high: A conversation went quiet once a message request was accepted.**
`mobile/src/app/conversation/[id].tsx:255` and the same in `src/components/messages/thread-view.tsx:200`. Accepting changed the effect's dependencies, the cleanup started leaving the Realtime channel, and `supabase.channel()` handed back that same leaving channel, which was then torn down. Both people fell back to a 20-second poll, with no typing or read receipts, right when they started talking. Reference: Bluesky keeps one long-lived agent per conversation (`src/state/messages/convo/agent.ts`). Fixed in b291e24 (app) and 5d9858d (website).

**bug high: Tapping a message push for the conversation already open showed "Something went wrong".**
`mobile/src/data/push.ts:248`. `router.push` stacked a second copy of the screen, whose `.on()` on the joined channel threw. Reference: Bluesky's `useNotificationHandler.ts` replaces rather than pushes. Fixed in b291e24 with a route id on the conversation screen, so the stack brings the open one forward.

**bug high: A failed server action replaced the whole website page with the error screen.**
About 25 call sites, such as `src/components/post/post-item.tsx:131` (like), `follow-button.tsx`, `rsvp.tsx`, `use-save.ts`. Offline, or in a tab open across a deploy, a Like rejected inside an async transition, React rethrew it to the nearest error boundary, and the feed with every page loaded was replaced by "This page didn't load". Reference: the try/catch already in `conversation-menu.tsx`. Fixed in e8d4005 with `reach()`, which turns the rejection into a failed `Result` so each caller's rollback runs, and rethrows Next's redirects.

**bug high: A link typed with a capital letter ("Https://…") made the post or message fail.**
`supabase/migrations/20261020000003_posts.sql:32` and the message and scheduled-post checks. Phones capitalise the first word of a sentence; finding links was case-insensitive but the stored-link checks weren't, so the member saw "Something went wrong". Reference: a Laravel social network, "Fix GitHub website URLs with uppercase schemes". Fixed in 664ec7a.

**bug high: Who to follow got slower with every person followed.**
`supabase/migrations/20261021113256_suggestions_without_a_post.sql:58`. The mutual count walked all the viewer's follows per candidate, calling `is_muted_by_viewer` for each pair: 8.6 seconds in a test with 2,500 profiles and 200 follows, so the most engaged members got the slowest home page and could hit the 8-second statement timeout. Reference: a Laravel social network's `SuggestedUsersQuery` counts once with a grouped join. Fixed in 7c22cfd: 60 ms, same suggestions.

**bug high: "Email me a sign-in link" created accounts.**
`src/app/actions/auth.ts:85`. `signInWithOtp` creates a user by default, so a mistyped or unknown address got an account named `member_…` without the sign-up form's username or age question. Reference: none. Fixed in d3138dc (`shouldCreateUser: false`, same answer either way); the app already did this.

**bug high: An online event's link was readable by anyone.**
`src/lib/community.ts:134`, `supabase/migrations/20261020000010_api_grants.sql`. Hosts are told the link shows only to people going, but guests and people the host blocked could read `online_url` through the API, and the app downloaded it for every event. Fixed in 0cbd796: the column isn't granted, and `event_online_url` gives it to the host's team, people going and moderators.

**bug high: A suspended or banned owner could still change team roles, and make someone who never accepted an owner.**
`supabase/migrations/20261020000001_core.sql:577` (`set_organisation_role`), also `pin_post`. Noted before (23 Oct security gaps, item 1) but these two functions were missed. Reference: a Laravel social network's `PreventPostingInTimeout` middleware. Fixed in 664ec7a.

### Medium

**bug medium: Declining a message request closed the conversation for good.** `20261020000004_messages.sql:259`. Message still showed on the profile, but the decliner's first message failed with a row-level-security error and the conversation never came back. Fixed in c60abe7: opening it again accepts it from that moment.

**bug medium: A block made after two people shared a group did nothing in the group.** `20261021101158_notifications_messages_and_limits.sql:261`. Each still read the other's messages, which counted as unread and showed as the last message. Fixed in c60abe7 in the messages policy.

**bug medium: `register_push_token` had no limit and took any token.** `20261023040121_push_notifications.sql:105`. Tokens from another Expo project make Expo refuse a whole batch of 100; registering them again each minute lost other members' pushes. Reference: a Laravel social network throttles device registration (`routes/api.php`, `throttle:devices`). Fixed in 150d98f: refused tokens stay refused for a month, new phones count towards 20 a day, and a refused batch shows on Health.

**bug medium: Replies, mentions and quotes from new members reached lock screens before the automatic check.** `20261023040121_push_notifications.sql:282`. The words went out at commit; a check that later held the post couldn't recall them, and a push for a held post still went out. Fixed in 150d98f: words wait for the check, and nothing is pushed about a post that isn't published.

**bug medium: Signing out everywhere left the member's other phones getting their pushes.** `mobile/src/data/session.tsx:95`, `src/app/actions/auth.ts:121`. Only the phone that signed out removed its token. Reference: Bluesky unregisters on logout. Fixed in 150d98f and eed62cc (`unregister_my_push_tokens`).

**bug medium: Guests could list the public media bucket.** `20261020000007_storage_realtime.sql:27`. Listing a member's folder found photos on removed, held and scheduled posts. Fixed in 0cbd796: listing is for the profiles a member acts as; files are still served by address.

**bug medium: Profiles deactivated as under 16 stayed public for the 30 days before deletion.** `src/lib/data/profiles.ts:31`. Fixed in 0cbd796 and eed62cc with `profile_hidden`.

**bug medium: Events and opportunities from someone the viewer has a block with stayed in their lists.** `src/lib/data/community.ts:78`. Fixed in 0cbd796 in the listing policies.

**bug medium: A moderator acting on a post its author had deleted counted it out again and told the author it was removed.** `20261020083027_age_assurance_and_notices.sql:186`. The parent showed one reply fewer than it had. Acting twice notified and logged twice. Reference: a Laravel social network's `DeleteCommit` acts on the tombstone. Fixed in 664ec7a.

**bug medium: Deleting an account left its replies and quotes counted on other people's posts.** `20261020000003_posts.sql:739`. Reference: a Laravel social network's `DeleteUser` updates hot scores of what the person engaged with. Fixed in 664ec7a.

**bug medium: Reinstating an age review republished a banned member's posts.** `20261023003426_…:507`. Fixed in 664ec7a.

**bug medium: A quote showed a muted person's post in full.** `20261021140000_audit_low_findings.sql:339`. Reference: Bluesky's `ContentHider` on quoted embeds. Fixed in 664ec7a (database and website) and eed62cc (app): it folds behind Show.

**bug medium: Reports kept the reporter's own words and contact after their account was deleted, and the export left them out.** `20261020000005_moderation.sql:14`. Breaks "everything about a person is in their export and erased with their account". Fixed in 664ec7a; poll options are in the export too.

**bug medium: `pnpm db:push` printed the database password on any failure, and passed any flag through.** `scripts/db-push.mjs:15`. Node's error repeats the command, connection string and all; `--include-seed` would have put the demo admin, whose password is in the README, into production. Fixed in e718443.

**bug medium: A like, save or follow that failed after its row scrolled away was never rolled back.** `mobile/src/util/toggle-queue.ts:39`. Reference: Bluesky's `useToggleMutationQueue` always finalises. Fixed in f91cdab.

**bug medium: The app's lenient parse ended feeds early.** `src/lib/feeds.ts:122`. One row an older app build couldn't read made a page of 20 look like the last. Reference: Bluesky lesson, "a parse failure on one row should drop the row". Fixed in 6d56592: the cursor comes from the raw rows.

**bug medium: Every list in the app re-rendered every row on any change.** `mobile/src/post/feed-list.tsx:61`. No `memo`, inline `renderItem`, three feeds mounted on Home. Reference: Bluesky's `memo(FeedItemInner)`. Fixed in af89e83 (memoised rows, stable renderItem; the React Compiler left off).

**bug medium: Pin, unpin and pull-to-refresh never updated the profile header or pinned post.** `mobile/src/app/(tabs)/…/profile/[username].tsx:50`. Fixed in ce9d36d.

**bug medium: Followers and Following spun for ever on an error, and reloaded on every return to the app.** `mobile/src/app/(tabs)/…/connections/[username].tsx:27`. Fixed in 50fdaaf.

**bug medium: An email link opened in the app while signed in switched accounts silently.** `mobile/src/app/auth/confirm.tsx:25`. Someone could send a member a link to their own account and read what the member then posted (login CSRF). Fixed in 53f9316: the app asks first.

**bug medium: An email link opened offline was cached as spent for the rest of the launch.** `mobile/src/data/auth.ts:120`. Fixed in 53f9316.

**bug medium: On phones a member never saw they had notifications.** `src/components/shell/nav.tsx:194`. Notifications sat inside More, which had no dot. Fixed in 3acfafe, with dots screen readers hear.

**bug medium: Message times on a conversation's first screen showed UTC.** `src/components/messages/message-item.tsx:15`. Rendered on the server, with `suppressHydrationWarning` keeping the server's text. Fixed in 5d9858d, with day dividers.

**bug medium: The Messages badge counted the conversation being read.** `src/components/shell/live-counts.tsx:26`. Reference: a Laravel social network's fix "keep the badge poll from marking an open conversation read". Fixed in 5d9858d.

**bug medium: The home feed couldn't be pinch-zoomed on phones.** `src/components/ui/swipe-tabs.tsx:13` (`touch-pan-y`). Fixed in 88fe3ad.

**bug medium: "Try again" on the website's error pages re-showed the same error.** `src/app/(app)/error.tsx:7`. `reset` re-renders the same failed answer; Next 16's `retry` refreshes. The pages also didn't show the reference the README promises. Fixed in 01238e0.

**bug medium: A rate-limited sign-in said the password was wrong.** `src/lib/schemas.ts:10`. A rate-limited reset said a link was on its way. Reference: a Laravel social network throttles sign-in per client IP. Fixed in 63e6092. See open items for the shared server IP.

**bug medium: The personal-details check missed numbers with a country code.** `src/lib/personal-info.ts:45`. +254, +234, +251 and 0061 numbers, the ones most likely to be family abroad. Fixed in 264b641.

**bug medium: An unreachable link-card image stopped the automatic check from checking a post's text.** `src/lib/automod.ts:33`. Text went in the same request as the first image. Fixed in 83a6760: the text goes alone.

**bug medium: The Messages badge in the app cleared on opening the tab and came back.** `mobile/src/data/counts.tsx:46`. Reference: Bluesky derives the count from the conversation list. Fixed in e7c7433.

**bug medium: The app's inbox reloaded every conversation on every message, even off screen.** `mobile/src/app/(tabs)/…/messages.tsx:56`. Fixed in e7c7433.

**bug medium: Several app screens showed a failed load as "not found" or an endless spinner.** Group, appeal, settings, organisation team. Fixed in bb29368.

**bug medium: Edited events and opportunities showed old details after Save, and editing hung offline.** Detail screens fixed in 077f902 and ce9d36d, the forms in 7142fd0.

**bug medium: Search terms went to Google Analytics.** `src/components/shell/analytics.tsx:39`. Noted before (privacy batch A). Fixed in 93e69ed: page views carry the path only. The GA property also needs history page views and site search turned off (see open items).

**cleanup medium: The client deleted profile photos before deleting an account, and on photo change.** `src/app/actions/settings.ts:53, 144`, `mobile/src/data/account.ts`. A failed deletion left the account with photos gone, and saving the same photo twice deleted the one in use; the database already queues these. Fixed in 3b8e970.

**bug medium (embeds): Embedded players needed a second tap, and several links didn't embed right.** `src/lib/embeds.ts`. Compared with a Laravel social network's embed providers (`app/Services/EmbedProviders/*`): no autoplay after the tap, `t=1m30s` read as one second, unlisted Vimeo links lost their hash, channel and player.vimeo.com links weren't recognised, and SoundCloud pages that aren't tracks (discover, likes) got a broken player. Fixed in 7e15dd4. See open items for what else that network embeds.

### Low

Fixed, one line each:

- **bug low:** blocked people could join and send on a direct conversation's Realtime channel. `realtime_topic_allowed`. c60abe7.
- **bug low:** a removed message kept its link and link card. c60abe7.
- **bug low:** removing a photo message scanned every message for each photo. `queue_message_media`. c60abe7.
- **bug low:** unaccepted team invitations were public. `organisation_members` policy. 0cbd796.
- **bug low:** share images for posts and events depended on who asked first, then were cached for everyone. `src/lib/data/posts.ts:74`. d3138dc.
- **bug low:** a failed reply-preview query failed the whole feed. `src/lib/data/posts.ts:28`. d3138dc.
- **bug low:** every parse failure showed on Health as "[". `src/lib/error-text.ts`. d3138dc.
- **bug low:** link cards with an emoji at the cut-off or certain character entities were never stored. `src/lib/link-preview.ts:30`. 264b641.
- **bug low:** avatar initials split a name's first emoji. `src/lib/text.ts:99`. 264b641.
- **bug low:** `emailSchema` trimmed after validating, so the app refused an address with a trailing space. `src/lib/schemas.ts:3`. 63e6092.
- **bug low:** profile cards were cached by username only, so the next member in the same tab briefly saw the last one's view, mutes included. `src/components/people/profile-card.tsx:23`. 2b49b60.
- **bug low:** the search palette could show and open results for an earlier term. Reference: a Laravel social network's "stale user search results" fix. `src/components/shell/shortcuts.tsx:164`. 2b49b60.
- **bug low:** Delete and Undo could be sent twice. Reference: a Laravel social network's undo toast guard. `post-item.tsx:178`. 2b49b60.
- **bug low:** a post whose third photo failed left the fourth in Storage. `src/components/post/composer.tsx:220`. 2b49b60.
- **bug low:** event times like 30 February rolled over, and impossible ones threw inside the form. `src/lib/community.ts:264`. 8dff7e5.
- **bug low:** Back to a section of the same page left the progress bar crawling for 12 seconds. `src/components/shell/progress-bar.tsx:78`. 8dff7e5.
- **bug low:** the app's email-change link pointed at production in any build. `mobile/src/data/settings.ts:18`. 8dff7e5.
- **bug low:** muting or blocking purged every cached page on the site. `src/app/actions/social.ts:25`. 93e69ed.
- **bug low:** Who to follow was read twice on the home page, and a topic's feed twice per visit. 93e69ed.
- **bug low:** right-to-left text in reply snippets, poll options, report snapshots and notes; scripted scrolls ignoring reduced motion; review-queue shortcuts on non-Latin layouts (all three noted before). 60bbfb0.
- **bug low:** profile pages had two top-level headings. 60bbfb0.
- **bug low:** a "Not now" on the push card was remembered for the phone, not the member; a message draft was written back after sign-out cleared drafts; the data export stayed in the app's cache. 6ca9a4d.
- **bug low:** "A link is on its way" showed when the request never left the phone. 53f9316.
- **bug low:** language settings lost unsaved changes on return to the app; leaving a team went back even when it failed. bb29368.
- **bug low:** blocking from a conversation left a stale Following. a9020c3.
- **bug low:** an offline sign-out ended only that phone's session without saying so. 7f95391.
- **bug low:** small touch targets in conversations (reactions 28 pt, retry 32 pt). 2fb7ee6.
- **bug low:** searching a followers list paged through every follower. 50fdaaf.
- **bug low:** the thread's menu offered Save on a saved post; two save queues per row could race. af89e83.
- **bug low:** Who to follow refetched on every remount, twice on Home. af89e83.
- **bug low:** posting refreshed every mounted profile, space and topic feed, not just the ones the post belongs in. be30219, 7142fd0.
- **bug low:** Discover, profile relationships and memberships turned errors into empty states. 077f902.
- **bug low:** a vote that landed but whose re-read failed left the poll open. dd46ddf.
- **cleanup low:** the scheduler-secret check was copied into three routes. 62b7c4e.
- **cleanup low:** the `as`-cast rule wasn't linted (none existed; now enforced in both configs), the app's CI skipped `expo install --check`, Dependabot didn't watch the app. ff6a1e9.
- **cleanup low:** database tests that passed for the wrong reason, a literal `true`, and `fails()` passing on any error. 618e3c4.
- **cleanup low:** the README listed 35 of 47 migrations and missed four environment variables and two Vault secrets. 89350dc.
- **cleanup low:** moderator-only policies called `is_moderator()` per row. 7c22cfd.
- **cleanup low:** the app's connections cursor wasn't parsed; copied helpers and unused exports. c06dcda.
- **cleanup low:** an animated image keeps its first frame, against what `reencode`'s comment said. 93e69ed.

### Fixed after PR 18 freed the sheet files

These files had uncommitted work in another session until PR 18 merged; after syncing with main they were fixed in 7142fd0:

- **bug medium:** `edit-profile.tsx`: a new photo or banner, saved the moment it's chosen, didn't reach the profile screen, and Cancel warned the photo wouldn't be saved though it was. Saving also told profiles to reload with a made-up post event; it uses `emitProfileChanged` now.
- **bug medium:** `event-form.tsx`, `opportunity-form.tsx`: loading an item to edit had no error path, so offline the sheet spun for ever.
- **bug low:** `event-form.tsx`: a new cover on an organisation's event went into the editor's own folder.
- **bug low:** `form.tsx`: `FieldError` wasn't read out by VoiceOver (`accessibilityRole="alert"` does nothing on iOS), and a sheet's busy button had no spoken name.
- **bug low:** `compose.tsx`: two taps on Post within one frame could both pass the `busy` check. A new post also refreshed every space and topic feed; it now names its space and topics.
- `report.tsx` and `profile-header.tsx` were reviewed and are fine.

---

## Open

### Needs a decision

**bug medium: An invite link makes the inviter follow any new account, which then skips message requests.** `supabase/migrations/20261022010100_invite_links.sql:68`, `initial_participant_status`. Anyone can sign up from mavuno.au/join/<username>, and the follow it creates lets their messages arrive as accepted, past a "people I follow" setting. PRODUCT.md says the two follow each other. Options: only the new member follows, and the "joined" notification offers Follow back; or keep the mutual follow but don't count an invite's follow for messaging (which would stop a real friend messaging an inviter whose setting is "people I follow").

**bug medium: Link card images load from the linked site.** `src/components/post/attachments.tsx:187`. Whoever shares a link learns who read it, when and from what IP address, and in messages this gets round read receipts being off. The fix is to fetch the image in the background task, re-encode it into Storage and store that address; it changes how every card is made, so it wasn't done in this pass.

**bug medium: Photos uploaded but never posted stay in Storage.** `src/app/api/upload/route.ts:58`. A discarded draft, a changed event cover or a failed message send leaves a public (or message) file nothing points to. A daily job could queue objects older than a day that no row references, but it deletes files in production if the reference check is wrong, so it should be designed and tested on its own. Message photos also can't be removed from the browser (no delete policy on `message-media`).

**bug medium: Every web sign-in may share one IP for Supabase's sign-in limit.** `src/app/actions/auth.ts:76`. Sign-ins run in server actions, so Supabase Auth likely sees Vercel's address: 30 sign-ins per 5 minutes shared by every website member. Check the IP on web sign-ins in the Supabase auth logs; if it's Vercel's, move password and link sign-in to the browser client or turn on captcha (the hardening notes list it as off).

**bug medium: Notifications regroup the whole history on every page and every 30-second poll.** `20261021101158_notifications_messages_and_limits.sql:86`. About 5 seconds at 15,000 notifications in the embedded test, growing linearly, and notifications are never pruned. Bounding it needs a two-phase rewrite of `notification_groups`; pruning old read ones changes what members see. Neither is urgent at today's size.

**bug medium: The age question's answer travels in client-writable sign-up metadata.** `src/app/actions/auth.ts:56`. A direct sign-up call can say `age_confirmed: true`. It's a self-declaration either way; either accept it in `docs/AGE_ASSURANCE.md` or have sign-up record nothing and rely on `confirm_age`.

### Low, left for later

- **bug low:** email templates build links as `{{ .RedirectTo }}&token_hash=…`, which breaks when Supabase falls back to the bare Site URL (dashboard-sent links, the invite template). `scripts/auth-email.mjs:34`. Changing live email templates should be tried on a test project first.
- **bug low:** `pnpm email:apply` puts localhost on the hosted redirect list and replaces the whole list; a rotated Resend key isn't applied. `scripts/auth-email.mjs:168`. Needs a call on how local development reaches the hosted project.
- **bug low:** the phone badge counts notifications and messages the app hides (a follow undone, a muted sender). `push_badge`.
- **bug low:** failed push sends to Expo with 429 or 5xx aren't retried (they now show on Health).
- **bug low:** Nearby and narrow feeds run three security-definer checks on every post they walk past. `feed_local`.
- **bug low:** Trending pages can repeat or skip posts as likes arrive within a visit. `feed_trending`.
- **bug low:** two moderators rejecting the same event or opportunity both notify (posts fixed).
- **bug low:** "Show more" previews can cut through a link and leave a live link to the wrong address. `src/lib/text.ts:82`.
- **bug low:** non-Latin link paths show as percent codes. `src/lib/text.ts:65`.
- **bug low:** length limits count UTF-16 units while the database counts characters (noted before). `src/lib/post-form.ts:20`.
- **bug low:** ban and under-16 deactivation run from one click in the report queue's menu. `src/components/moderation/report-queue.tsx:131`.
- **bug low:** cancelling or confirming Delete drops keyboard focus to the top of the page. Reference: a Laravel social network's "restore focus after canceling commit deletion". `post-item.tsx:298`.
- **bug low:** Like and Follow buttons' spoken names; the search palette and mention menu aren't comboboxes; form errors aren't tied to fields. Reference: a Laravel social network's `search-dialog.tsx` and `mention-textarea.tsx`.
- **bug low:** Translate's Google fallback is blocked as a pop-up in Safari. `src/components/post/translation.tsx:33`.
- **cleanup low:** many exported server actions `parse` their input and throw instead of returning `Result` (AGENTS.md). They no longer replace the page (`reach()`), but a stale client's call is counted as a server error.
- **cleanup low:** the app re-implements about 45 loaders from `src/lib/data`; they have drifted (blocks on attendees and the online link had to be fixed twice).
- **cleanup low:** insert grants let members set `created_at` on follows, likes, RSVPs and more (triggers overwrite the counters and status that matter).
- **cleanup low:** guests' select grants on `profile_settings`, `saves` and `poll_votes` stay, because `post_details` needs them to run for guests; the policies give guests no rows.
- **cleanup low:** the IndexNow cron builds every sitemap file each day to find one day's changes. `src/app/api/indexnow/route.ts:25`.
- **cleanup low:** no `SECURITY.md`, and GitHub secret scanning is off (hardening notes). The Fathom code and docs remain though Fathom was dropped.
- **cleanup low:** the GA property should have enhanced measurement's history page views and site search off, or Google reads full addresses itself.

### Embeds compared with a Laravel social network

Both build players only from a fixed list of providers and load them only after a tap, so reading a feed never contacts the player's site. After 7e15dd4 the remaining differences are choices, not bugs: that network also embeds Twitch, Suno, Apple Music, CodePen and Asciinema and YouTube playlists, has a switch and a provider list in config, shows YouTube's own thumbnail when a page gives servers no picture (Mavuno shows a play mark instead, to avoid one more request to Google per reader), lets authors choose which link becomes the card, and shows link cards inside quoted posts. Mavuno embeds TikTok, which it doesn't. Apple Music and Suno may be worth adding for this community.

### Unconfirmed, worth a look on a device or with the logs

- The app's hold-menu actions run while its modal is still closing; Report from it may not appear (`mobile/src/app/conversation/[id].tsx:635`).
- The APNs environment in Xcode archives: `expo-notifications` defaults to `development`; check the uploaded build's entitlements.
- Undo racing the 30-second purge could erase a restored post (needs two real connections to show).
- `TRANSLATE_API_URL` in production would contradict the privacy policy, which says Translate only opens Google Translate.
- `secure_password_change` is off locally; if production matches, a stolen session can change the password.
