# Working on the Mavuno app

The website's `../AGENTS.md`, `../PRODUCT.md` and `../DESIGN.md` apply here too. This file adds what is different about the app; `README.md` explains how to run and build it.

## Expo has changed: don't trust your training data

Expo ships breaking changes every SDK. Before writing code against an Expo or React Native API, read the major version of `expo` in `package.json` and the matching docs at `https://docs.expo.dev/versions/v<major>.0.0/` (any docs page has a Markdown version at the same address plus `.md`; `https://docs.expo.dev/llms.txt` indexes them).

- Add packages with `npx expo install <package>`, never `npm install`, so versions match the SDK.
- `ios/` and `android/` are generated (`npx expo prebuild`). Configure them through `app.json` and config plugins, never by hand.
- Builds and App Store uploads go through Xcode on the owner's Mac. Don't suggest EAS.

## Where things go

- `src/app/` holds routes (Expo Router); every file there is a screen.
- `src/data/` holds the Supabase client, the session and the queries. The queries follow the website's loaders in `../src/lib/data/` and use the same database functions.
- `src/post/`, `src/people/` and `src/ui/` hold components; `src/util/` holds links, sharing, time, the event bus and the toggle queue.
- A like or a follow is written to `src/data/shadow.tsx` first and laid over every row that shows the post or profile, then sent through `src/util/toggle-queue.ts`, which serialises taps and puts the server's answer back in the shadow. Add new toggles the same way rather than keeping state in a row.
- `@/lib/*` is the website's `../src/lib`. Import shared types, schemas and helpers from it, and don't copy them. If what you need is in a server-only file, move it to a plain module on the website side first.

## Rules

- Light and dark come from `usePalette()`. Its colours are the website's tokens.
- Text goes through `Text` from `src/ui/text.tsx`, so it scales with the reader's text size. Don't give anything that holds text a fixed height: use `minHeight` and padding. Cap `maxFontSizeMultiplier` only on chrome such as segmented controls and header titles.
- Touch targets are at least 44 points.
- A post row isn't one accessibility element: its avatar, links and buttons are reachable one by one.
- The app runs on Hermes. It has no `toSorted`, `toReversed` or `findLast`, and it leaves `match.groups` empty for named regex groups. The lint rule `no-restricted-syntax` catches them here and in `../src/lib`.
- Photos go to `/api/upload` as an expo-file-system `File`: Expo's `fetch` refuses React Native's `{ uri, type, name }` form parts.
- Fast typing from simulator tools can drop characters in single-line fields, because each key makes a round trip through React state. Type slowly or in chunks when testing; people typing on a phone don't hit it.
- Run `npm run check` here and `pnpm check` at the root.
