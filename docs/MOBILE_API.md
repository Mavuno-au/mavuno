# Mobile app API

What the iPhone and Android app (Expo, React Native) calls, and how that matches the website. The app signs in with Supabase Auth and talks to the database with `supabase-js`, like the browser does. Row level security, rate limits in the database and moderation hold for any client, so most of what the website does through server actions the app does straight against Supabase. A few things need the server: they are the API routes below.

## Signing requests to mavuno.au

Supabase gives the app a session. Send its access token to the website's API routes:

```
Authorization: Bearer <session.access_token>
```

- The routes that take it are `/api/upload`, `/api/translate`, `/api/export` and `POST /api/tasks`. Every other route either needs no session or is for the website only.
- The token is checked with Supabase (`auth.getClaims`, the same check the cookie path uses) and the route then acts as that member, so row level security applies as it does on the website.
- A request with an `Authorization` header is judged by that header alone. A token that is missing, malformed or expired is a 401; it never falls back to a cookie. Requests without the header keep using the website's session cookie, unchanged.
- `supabase-js` refreshes the session on its own. On a 401, call `supabase.auth.refreshSession()` once and retry.
- Native apps don't need CORS, so the routes send no CORS headers.

## API routes

### `POST /api/upload`

Every photo goes through the server, which re-encodes it to WebP and so drops location and camera metadata. Storage takes writes only from the server.

Multipart form fields:

| Field | Value |
|---|---|
| `file` | The image (JPEG, PNG, WebP or GIF), at most 4 MB. Shrink it on the phone first (the website sends at most 1,600 px wide). |
| `bucket` | `media` or `message-media` |
| `folder`, `ownerId` | For `media`: `posts`, `events`, `banners` or `avatars`, and the profile it belongs to (the member's own or an organisation's they help run). |
| `conversationId` | For `message-media`. |

Answers `{ path, width, height }`. Errors are `{ error }` with a sentence to show: 401 signed out, 403 not allowed there, 413 too big, 415 not an image, 429 more than 30 a minute, 503 uploads paused or off. A public image's address is `supabase.storage.from("media").getPublicUrl(path)`; message images are read with signed URLs, as on the website.

### `POST /api/translate`

JSON `{ postId, target }` (`target` is a two- or three-letter language code; the member's chosen translation language wins). Answers `{ text }`. 404 when translations are off or the post can't be read, 429 after 10 new translations a minute, 501 with no provider.

### `GET /api/export`

The member's data as a JSON file (`Content-Disposition: attachment`). Three times an hour; errors are plain text. Save it with the share sheet.

### `POST /api/tasks`

JSON `{ targetId }`, the id of a post, message, event or opportunity the app just created or edited. Answers 202 at once and then fetches its link card and runs its automatic check (both queued by the database), as the website's server actions do with `after()`. Only for something the signed-in member created or sent; anything else answers 404, including a listing a teammate created that this member edited. Without it the tasks still run within about two minutes, when the database next wakes `/api/tasks`. 30 a minute. (`GET /api/tasks` is the cron's and takes the cron secret, not a member's token.)

## Age check before sign-up

The website asks for a date of birth before anyone chooses email or Google, compares it with `meets_minimum_age`, and keeps it in an httpOnly cookie for at most 30 minutes because Google sign-in leaves the site and comes back. The app does the same without a cookie and without a new server route:

1. Ask for day, month and year (three fields, as on the website) and parse them with `birthDateSchema` from `src/lib/age.ts`.
2. Call `supabase.rpc("meets_minimum_age", { p_birth_date })`. Guests may call it. The rule lives only in the database.
3. **Under 16:** show the under-16 screen and keep a flag (no date, nothing personal) in `expo-secure-store` for 24 hours. While it is set the app shows that screen instead of the question, as the website's `mavuno-under-16` cookie does.
4. **16 or older:** keep the date in component state only, never in AsyncStorage, SecureStore, logs or crash reports, and drop it as soon as the account exists. Native Google and Apple sign-in return in the same process, so nothing has to survive a round trip.
5. After sign-up:
   - **Email:** `supabase.auth.signUp` with `age_confirmed: true` in the metadata (below). Only the outcome goes with the account, never the date.
   - **Google or Apple:** straight after `signInWithIdToken`, call `supabase.rpc("confirm_age", { p_birth_date })`. `true`: go on. `false`: the database has deactivated the account and recorded the step; set the under-16 flag and show the deactivated screen.
6. Anyone who reaches the app without a confirmed age (`profile_settings.age_confirmed_at` is null), for example after the app was closed between sign-in and step 5, is asked once with `confirm_age`, as the website's `/onboarding/age` does.

**Why not a signed token.** A route that checks the date and returns a short-lived signed token, which sign-up then presents, was considered. It would prove only that someone answered the question, not their age: anyone can get one by typing an older date, which is all the website's form asks too. The `age_confirmed` metadata is likewise readable by any client with the publishable key, today as before. The question is self-declaration; eSafety's guidance says it can't carry the weight alone, and in Mavuno it doesn't (see `docs/AGE_ASSURANCE.md`: reports, moderator review, deactivation and deletion). A token would add a secret to manage and a route to keep up for no extra assurance, so the app uses the same database functions the website does. If a stronger check is added later (age estimation, say), it belongs in a server route and `handle_new_user` should then require its result instead of the metadata flag, for the website and the app together.

## Sign-up, sign-in and invite links

### Email and password

Do what `signUp` in `src/app/actions/auth.ts` does:

1. Parse with `emailSchema`, `passwordSchema` and `usernameSchema`, and refuse a username `revealsEmail` flags (all in `src/lib/schemas.ts`).
2. Refuse a taken name (`profiles` where `username` matches) or a reserved one (`rpc("is_reserved_username", { p_username })`). Guests may run both.
3. Call:

   ```ts
   supabase.auth.signUp({
     email, password,
     options: {
       emailRedirectTo: "https://mavuno.au/auth/confirm?next=%2Fonboarding",
       data: { username, display_name, age_confirmed: true, ...(invite ? { invited_by: invite } : {}) },
     },
   });
   ```

4. Map errors as the action does: `user_already_exists`; status 429; and a failure after which the username now exists, which means two people took the name at once (`handle_new_user` raises 23505).

`invited_by` is the inviter's username from an invite link. The database records the invite when the address is confirmed (trigger `on_auth_user_invited`), so the app does nothing more.

### Email links

Confirmation, magic-link, email-change and password-reset emails link to `https://mavuno.au/auth/confirm?token_hash=…&type=…&next=…`. Until the app claims that path as a universal link (iOS) and app link (Android), the link opens the website, which confirms the address and signs the person in there; they then sign in in the app. Once the app has a bundle ID and package name, serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` for `/auth/confirm` and `/join/*`, and have the app call `supabase.auth.verifyOtp({ token_hash, type })` itself. Password resets keep working on the website either way.

### Google

Use native Google sign-in (`@react-native-google-signin/google-signin`) and `supabase.auth.signInWithIdToken({ provider: "google", token: idToken })`. Then do what `/auth/callback` does, in this order:

1. `rpc("confirm_age", { p_birth_date })` if the person came through sign-up (see above).
2. `rpc("accept_invite", { p_username })` if they came from an invite link. It only works for an account made in the last hour, and only once the age is confirmed (`record_invite` checks), so it must come after step 1.

A Google sign-up gets a generated username (`member_…`); onboarding lets them change it, as on the website.

Dashboard (Authentication → Sign In / Providers → Google): add the iOS and Android OAuth client IDs, made in Google Cloud for the bundle ID and package name, to **Client IDs** next to the web one. Supabase's guide for React Native notes that the iOS SDK may need **Skip nonce check**.

### Sign in with Apple

The App Store requires it when an app offers Google sign-in (guideline 4.8). It isn't configured yet. In the app: `expo-apple-authentication` with a SHA-256 nonce, then `signInWithIdToken({ provider: "apple", token: identityToken, nonce: rawNonce })`, then the same two calls as Google. Apple sends the person's name only the first time and not in the token, so on that first sign-in save it with `profiles.update({ display_name })` (the profile already exists with a generated name).

Steps for the owner:

1. **Apple Developer → Certificates, Identifiers & Profiles → Identifiers:** on the app's App ID, turn on **Sign In with Apple**.
2. **Supabase → Authentication → Sign In / Providers → Apple:** turn it on and put the app's bundle ID in **Client IDs**. That is all native iPhone sign-in needs; no secret.
3. **Only for Apple sign-in on Android or the website:** create a **Services ID** (e.g. `au.mavuno.signin`) with domain `mavuno.au` and return URL `https://<project-ref>.supabase.co/auth/v1/callback`; create a **Key** with Sign In with Apple enabled and download the `.p8`; in Supabase add the Services ID to Client IDs and generate the **Secret Key** from the Team ID, Key ID and `.p8`. Apple limits that secret to six months, so put renewing it in the calendar. The Android app can also leave Apple out; the rule is the App Store's.
4. **Apple Developer → Services → Sign in with Apple for Email Communication:** register `mavuno.au` and `hello@mavuno.au` (Resend's SPF and DKIM already cover the domain), or emails to people who chose Hide My Email never arrive.
5. **Account deletion:** Apple expects an app to revoke the person's Apple tokens when they delete an account made with Sign in with Apple (`https://appleid.apple.com/auth/revoke`). That needs the `.p8` key on the server and the authorization code from sign-in; Supabase doesn't do it. Decide before submission whether to add a route for it or rely on the person removing Mavuno under Apple ID settings, which App Review has accepted from some apps but not all.

## What the website does that the app must do itself

- **Daily activity:** the website's proxy calls `rpc("mark_seen")` once a day per member for Operations' active counts. Call it when the app comes to the foreground, at most once a day.
- **After creating anything:** `POST /api/tasks` with its id (above).
- **Unread counts:** `rpc("unread_notification_count")` and `rpc("unread_message_count")`.
- **Realtime:** subscribe to the same channels the website's components do (`src/components/messages`, `src/components/shell`).

## Server actions

Every server action in `src/app/actions`, and what the app does instead.

- **RPC**: a thin wrapper over a database function. Call `supabase.rpc` with the same arguments.
- **Table**: a thin insert, update or delete that row level security guards. Do the same query.
- **Repeat**: holds logic the app must repeat; what it is is noted. The rule itself is still in the database; the app repeats it to show a clear message before the database refuses.
- **Route**: needs the server; use the API route.

Error messages: database functions raise sentences meant for people. Show them through `friendlyError` in `src/lib/result.ts`, which the app can import as it is.

### `age.ts`

| Action | Kind | What the app does |
|---|---|---|
| `checkAge` | Repeat | `birthDateSchema`, `rpc("meets_minimum_age")`, the under-16 flag in SecureStore (see Age check). |
| `confirmAge` | RPC | `confirm_age(p_birth_date)`; `false` means deactivated. |

### `auth.ts`

| Action | Kind | What the app does |
|---|---|---|
| `signUp` | Repeat | Field checks, taken and reserved username checks, `auth.signUp` with metadata (see Email and password). |
| `signIn` | Auth | `auth.signInWithPassword`; `email_not_confirmed` means "Confirm your email first". |
| `sendMagicLink` | Auth | `auth.signInWithOtp` with `emailRedirectTo` `https://mavuno.au/auth/confirm?next=…` (see Email links). |
| `signInWithGoogle` | Repeat | Native Google sign-in, then `confirm_age` and `accept_invite` (see Google). |
| `requestPasswordReset` | Auth | `auth.resetPasswordForEmail` with `redirectTo` `https://mavuno.au/auth/confirm?next=%2Freset-password`. Always say the email is on its way. |
| `updatePassword` | Auth | `auth.updateUser({ password })`; `same_password` has its own message. |
| `signOut` | Auth | `auth.signOut()`. |

### `events.ts`

| Action | Kind | What the app does |
|---|---|---|
| `createEvent` | Repeat | The form rules in `eventSchema` (online needs a link, in person a city, the end after the start, a start in the future, a cover image under our `media` bucket), local time plus time zone to UTC (`fromZonedInput`), insert into `events` with `host_id` and `created_by`, then `POST /api/tasks`. |
| `updateEvent` | Repeat | The same rules, update by id, then `POST /api/tasks`. |
| `setRsvp` | Repeat | `event_rsvps`: delete for none; otherwise update the status and insert if no row changed (an upsert is refused). |
| `cancelEvent` | Table | Update `events.cancelled_at`. |

### `messages.ts`

| Action | Kind | What the app does |
|---|---|---|
| `startConversation` | RPC | `start_direct_conversation(p_user_id)` returns the id. |
| `createGroup` | RPC | `create_group_conversation(p_title, p_member_ids)`; title at most 60, 1 to 99 people. |
| `addMembers` | RPC | `add_group_members(p_conversation_id, p_member_ids, p_share_history)`. |
| `renameGroup` | RPC | `rename_group`. |
| `removeMember` | RPC | `remove_group_member`. |
| `setRole` | RPC | `set_group_role`. |
| `respondToRequest` | RPC | `respond_to_message_request(p_conversation_id, p_accept)`. |
| `setArchived`, `setMuted` | Table | Update the member's own `conversation_participants` row (`status = accepted`). |
| `markRead` | Repeat | Find the newest message's `created_at`, move `last_read_at` up to it only if it is behind, and if it moved and the member's `read_receipts` is on, announce the read on the conversation's channel as `thread-view.tsx` does. |
| `sendMessage` | Repeat | Upload images with `/api/upload` (`message-media`), insert into `messages` (send `image_alts` only when one is filled in), then `POST /api/tasks` for its link card. |
| `setReaction` | Table | Upsert or delete in `message_reactions`. |
| `fetchMembers`, `fetchMessage`, `loadNewerMessages`, `loadOlderMessages`, `fetchReactions` | Read | The queries in `src/lib/data/messages.ts`. |
| `searchPeople` | RPC | `search_profiles(p_query, p_limit)`, keeping people other than the member. |

### `moderation.ts`

Moderators and admins; the website can stay the place for this at first. All except `acceptRules` check the member's role in the database.

| Action | Kind | What the app does |
|---|---|---|
| `acceptRules` | RPC | `accept_rules()`, once before the first post. Every member needs this. |
| `moderate` | RPC | `moderate_content`; removing needs a rule. |
| `approveAll` | Repeat | `moderate_approve_posts` for posts, then `moderate_content` for each other item. |
| `dismissReports` | RPC | `moderate_dismiss_reports`. |
| `suspend`, `ban` | Repeat | Look up a username in `profiles` (people only), then `moderate_suspend` or `moderate_ban`. |
| `liftSuspension` | RPC | `moderate_lift_suspension`. |
| `restoreDecision` | RPC | `moderate_restore`. |
| `deactivateUnder16` | Repeat | Username lookup, then `moderate_deactivate_under_16`. |
| `reinstateAge` | RPC | `moderate_reinstate_age`. |
| `verifyOrganisation` | RPC | `moderate_verify_organisation`. |
| `setSiteRole` | Repeat | Username lookup, then `admin_set_site_role`. |
| `updateSiteSettings` | RPC | `admin_update_site_settings`. |

### `notifications.ts`

| Action | Kind | What the app does |
|---|---|---|
| `loadNotifications` | RPC | `notification_groups`, with the tab's types from `findFilter` (`src/lib/notifications.ts`), the phone's time zone, pages of 20 and the cursor of the last group. |
| `loadNotificationGroup` | RPC | `notification_group_items`. |
| `markNotificationsRead` | RPC | `mark_notifications_read(p_recipient_id, p_types)` for the open tab only. |

### `operations.ts`

| Action | Kind | What the app does |
|---|---|---|
| `updateSwitches` | RPC | `admin_update_switches` (admins). |

### `opportunities.ts`

| Action | Kind | What the app does |
|---|---|---|
| `createOpportunity` | Repeat | The rules in `opportunitySchema` (a link or an email to apply, a deadline not passed, the deadline at 23:59 Sydney time), insert into `opportunities` with `poster_id` and `created_by`, then `POST /api/tasks`. |
| `updateOpportunity` | Repeat | The same, update by id, then `POST /api/tasks`. |
| `setOpportunitySaved` | Table | Upsert or delete in `saved_opportunities`. |
| `closeOpportunity` | Table | Update `opportunities.closed_at`. |

### `organisations.ts`

| Action | Kind | What the app does |
|---|---|---|
| `createOrganisation` | RPC | `create_organisation`. |
| `addTeamMember` | Repeat | Username lookup (people only), insert into `organisation_members`; 23505 means already on the team. |
| `setTeamRole` | RPC | `set_organisation_role`. |
| `handOverOwnership` | Repeat | `set_organisation_role` to make the other person owner first, then the member admin, so there is always an owner. |
| `removeTeamMember` | Table | Delete from `organisation_members`; no row deleted means not allowed. |
| `deleteOrganisation` | Repeat | Owners only. Remove the organisation's files from `media` (list and remove under `<orgId>/posts`, `avatars`, `banners`, `events`, as `removeProfileMedia` does; storage lets members delete files of profiles they act as), then `delete_organisation`. |
| `acceptTeamInvitation` | RPC | `accept_team_invitation`. |
| `declineTeamInvitation` | Table | Delete the member's own `organisation_members` row. |

### `post-presence.ts`

| Action | Kind | What the app does |
|---|---|---|
| `postPresence` | Read | Read the post from `post_details`; no row is unavailable, a tombstone is deleted (`postRowSchema` in `src/lib/domain.ts`). |

### `posts.ts`

| Action | Kind | What the app does |
|---|---|---|
| `createPost` | Repeat | Upload images with `/api/upload` (`media`, `posts`); send a link only when it is in the body (`allUrls` in `src/lib/text.ts`); `rpc("create_post")`; read the new row from `post_details`; `POST /api/tasks`. |
| `schedulePost` | Repeat | The same link rule, `rpc("schedule_post")`. The database publishes it. |
| `loadLinkPreview` | Read | `posts.link_preview` for the new post, while the composer waits for its card. |
| `cancelScheduledPost` | Table | Delete from `scheduled_posts`; no row means it already went out. |
| `deletePost`, `restorePost`, `pinPost`, `unpinPost`, `votePoll` | RPC | `delete_post`, `restore_post`, `pin_post`, `unpin_post(p_profile_id)`, `vote_poll`. |
| `setLike`, `setSaved` | Table | Upsert or delete in `likes` or `saves`. |
| `loadMore`, `loadMoreReplies`, `loadMoreThread`, `loadPostLikers` | Read | The feed functions in `src/lib/data/posts.ts` (`feed_following`, `feed_latest`, `feed_trending`, `feed_space`, `feed_topic`, `feed_profile`, `feed_local`, `feed_saved`, `post_replies`, `post_continuation`) and their cursors. |
| `newPostCount` | RPC | `count_new_posts`. |

### `settings.ts`

| Action | Kind | What the app does |
|---|---|---|
| `updateProfile` | Repeat | The limits in `profileSchema`, update `profiles`; no row updated means not allowed. |
| `checkUsername` | Repeat | Taken in `profiles`, or `is_reserved_username`. |
| `setProfileImage` | Repeat | Upload with `/api/upload` (`avatars` or `banners`), update `avatar_url` or `banner_url`, then remove the file it replaced from `media`. |
| `updatePrivacy` | Table | Update `profile_settings` (`dm_policy`, `discoverable`, `read_receipts`). |
| `updateLanguages` | Table | Update `profiles.languages` and `profile_settings` (`translation_language`, `feed_languages_only`). |
| `changeEmail` | Auth | `auth.updateUser({ email }, { emailRedirectTo: "https://mavuno.au/auth/confirm?next=%2Fsettings%2Faccount" })`; refuse while suspended. |
| `changePassword` | Auth | `auth.updateUser({ password })`; `reauthentication_needed` means sign in again. |
| `joinSpaces` | Table | Upsert into `space_members`. |
| `finishOnboarding` | Table | Update `profile_settings.onboarded_at`. |
| `deleteAccount` | Repeat | Ask for the username, remove the member's files and those of organisations they alone own (`soleOwnedOrganisations`), `rpc("delete_my_account")`, sign out. Required in the app by the App Store; see Sign in with Apple for token revocation. |

### `shell.ts`

| Action | Kind | What the app does |
|---|---|---|
| `refreshCounts` | RPC | `unread_notification_count`, `unread_message_count`. |
| `loadSuggestionPage` | Repeat | `rpc("suggestion_pool")`, paged with `suggestionPages` and `spareSuggestions` from `src/lib/who-to-follow.ts` (keep the round in app storage instead of a cookie). |
| `dismissSuggestion` | Table | Upsert or delete in `suggestion_dismissals`. |

### `social.ts`

| Action | Kind | What the app does |
|---|---|---|
| `setRelation` | Table | Upsert or delete in `follows`, `mutes` or `blocks`. |
| `reportContent` | RPC | `report_content`; a legal complaint needs details and a contact. |

### `spaces.ts`

| Action | Kind | What the app does |
|---|---|---|
| `createSpace` | Repeat | Slug rules (2 to 40 lowercase letters, numbers or dashes; not `new`, `interests` or `joined`), `rpc("create_space")`; 23505 and 23514 mean the address is taken. |
| `setMembership` | Table | Upsert or delete in `space_members`. |

## Code the app can share

The app in `mobile/` imports these modules from `src/lib` as `@/lib/*` (see `mobile/README.md`). They import nothing from Next.js or the server and import each other with the same alias: `domain.ts`, `schemas.ts`, `age.ts`, `result.ts`, `text.ts`, `notifications.ts`, `catalogue.ts`, `rules.ts`, `feeds.ts`, `format.ts`, `invites.ts`, `who-to-follow.ts`, `calendar.ts`, `personal-info.ts`, `schedule.ts`, `reply-previews.ts` and `brand-mark.ts`.

- `feeds.ts` holds the time cursors the feeds page by (`cursorOf`, `parseTimeCursor`), and `domain.ts` the profile row and its columns (`profileRowSchema`, `PROFILE_COLUMNS`).
- `schemas.ts` holds the sign-in form and its messages (`signInSchema`, `signInError`).
- `format.ts` holds a poll's time left (`pollTimeLeft`), `text.ts` avatar initials, and `reply-previews.ts` how many replies show under a post by default.

The form schemas for events, opportunities and spaces (`formField`, `fromZonedInput`, `RESERVED_SPACE_SLUGS`) and most row parsers in `src/lib/data/*` sit in server-only modules, and the event, opportunity and profile edit schemas are inside the action files. Move each to a plain module when the app first needs it, as was done for the feeds and profiles.
