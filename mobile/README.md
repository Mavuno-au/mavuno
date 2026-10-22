# Mavuno for iPhone and Android

An Expo app in TypeScript (Expo SDK 58, React Native 0.88, Expo Router). It signs in with Supabase Auth and reads straight from the database with `supabase-js`, like the website's browser code, so row level security, mutes and blocks hold here too. `../docs/MOBILE_API.md` says what the app does and which website routes it calls. The screens follow the iPhone designs on the design canvas.

## What it does

Every member screen in the iPhone designs. Moderation and operations stay on the website, for staff; push notifications aren't built yet.

- **Joining:** date of birth first (under 16 sees a support screen for a day and nothing is kept), then name, a username checked as you type with free ones offered, email and password. Invite links (`mavuno.au/join/<username>`) show who invited you. Then the website's four onboarding steps: about you, people to follow, spaces to join and how Mavuno works.
- **Signing in** with a password or an emailed link, and password resets by email. Email-only for now; Apple and Google sign-in come later.
- **Home:** Following, Latest and Trending, with the newest replies under each post and a pill for posts published since you looked.
- **Posting:** the full composer, posting as yourself or an organisation you help run, with mentions, up to four photos with descriptions, polls, link cards, scheduling, a language and kept drafts. Replies, quotes, saves, pins, delete with Undo, translations and a photo viewer.
- **Messages:** inbox, requests and archived, direct and group conversations with photos, replies, reactions, typing and read receipts, all live.
- **Notifications** grouped as on the website, with filters and the badge on the tab.
- **Profiles:** follow, message, followers you know, team, followers and following, edit profile with photo and banner, and Invite friends.
- **Discover:** search, people, organisations, topics, spaces, Nearby, events with RSVP and Add to calendar, and opportunities with saving. Members can start a space, host an event and post an opportunity.
- **Settings:** account (username, email, password, download your data, delete account), privacy, languages, appearance, muted and blocked, and organisations with their teams.
- **Safety:** mute, block and report from any post, message or profile, as the App Store requires. A banned or age-deactivated account sees the notice, its appeal, a data download and account deletion, nothing else.

Links open only when they are web or email addresses, and a link whose label names one site while it goes to another says so before it opens.

Light and dark follow the phone. Text follows the phone's text size, and at the largest sizes post rows stack.

## Code shared with the website

The app imports the website's plain modules from `../src/lib` as `@/lib/*` rather than copying them. These are domain types and zod row parsers, cursors, form schemas, text and date helpers, the catalogue and the logo. Anything the app needs from a server-only file is moved into a plain module first.

- `metro.config.js` watches `../src/lib`. Packages those files import, such as zod, resolve from this folder's `node_modules`, so there is only one copy of each.
- `tsconfig.json` maps `@/lib/*` to the website and `@/*` to `src/`. Don't add a `src/lib` folder here, because the website's would shadow it.
- The website's typecheck and lint skip `mobile/`. Run `npm run check` here after changing a shared module, and `pnpm check` at the root.

## Run it in the iOS Simulator

You need Xcode, CocoaPods (`brew install cocoapods`) and Node 20.9 or newer.

```bash
cd mobile
npm install
cp .env.example .env.local
```

Put the Supabase URL and publishable key in `.env.local`. For a local stack (`pnpm db:start` and `pnpm db:reset` at the root), use `http://127.0.0.1:54321` and the key it prints. Then sign in with a demo account from `supabase/seed.sql`, such as `kofi@example.com` with the password `mavuno-demo`. Never use a real member's password for testing.

```bash
npx expo run:ios
```

This creates `ios/`, installs the pods, builds with Xcode and opens the Simulator. CocoaPods needs a UTF-8 terminal: if `pod install` fails with an encoding error, run `export LANG=en_US.UTF-8` first. Later, `npx expo start` reloads the JavaScript without rebuilding.

Keep the clone outside iCloud Drive (for example in `~/Developer`, not in `~/Documents` when Desktop & Documents syncing is on). Inside iCloud Drive, Xcode fails to sign one of Expo's frameworks with "resource fork, Finder information, or similar detritus not allowed", because iCloud stamps its metadata on files as they are built inside `node_modules`, and Git and `node_modules` sync badly in general.

You can also test on your own iPhone with Expo Go: run `npx expo start` and scan the QR code. Use the hosted Supabase values for this, because the phone can't reach your Mac's `127.0.0.1`.

## Build for the App Store with Xcode

No Expo account or EAS is needed.

1. Run `npx expo prebuild --platform ios`. The `ios/` folder is generated from `app.json` and is not committed. Change `app.json` and run prebuild again rather than editing `ios/`.
2. Open `ios/Mavuno.xcworkspace` in Xcode.
3. Under Signing & Capabilities, choose your team. The bundle ID is `au.mavuno.app`. Then choose Product › Archive, and in the Organizer choose Distribute App › App Store Connect.

Before the first upload, you need an Apple Developer account, the app created in App Store Connect, and Sign in with Apple. Sign in with Apple is required as soon as Google sign-in is offered (see `../docs/MOBILE_API.md`).

## Checks

```bash
npm run check
```

This runs TypeScript, ESLint (with the website's rules: no `any`, no `!`, no `console`) and `expo install --check` for SDK-compatible versions.

## Icons and launch screen

`pnpm brand` at the root draws `assets/icon*.png`, `assets/android-icon-*.png` and `assets/splash*.png` from `src/lib/brand-mark.ts`: the mark on sand, with iOS's dark and tinted versions.
