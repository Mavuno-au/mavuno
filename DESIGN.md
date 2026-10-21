# Design

## Overview

A calm, warm reading surface. A sand-coloured shell holds a white 620px column of posts separated by hairlines. One deep green does every job of action and location; six identity colours mark people and nothing else. City spaces carry a photo of their city. Dark mode mirrors every token on a warm graphite.

## Tokens

Defined once in `src/app/globals.css` as CSS variables and exposed to Tailwind (`bg-surface`, `text-ink-muted`, `border-hairline` and so on). The `.dark` class on `<html>` swaps them; `src/lib/theme.ts` chooses it (Light, Dark or System, saved per browser).

| Token | Use |
|---|---|
| `shell` | page background around the column |
| `surface` | the post column, sticky headers, bottom bar |
| `popover` | menus and dialogs |
| `ink`, `ink-muted` | primary text, secondary text and metadata |
| `hairline` | every divider |
| `rail` | input borders, guide lines in threads, dashed placeholders |
| `wash` | hover backgrounds, image placeholders |
| `primary`, `primary-hover`, `primary-soft` | buttons, links, the focus ring (solid, 2px), current nav item and tab, selection |
| `destructive`, `destructive-soft`, `destructive-ink` | delete, block, report and their confirmations; `destructive-ink` is the text on a destructive button (white in light, near-black in dark, so it reads at 4.5:1 on both) |
| `colour-0`…`colour-5` | a person's identity colour: avatar ring and the dot before a handle only |

**One green.** Primary means "you can act here" or "you are here". It is never decoration and never an identity colour.

**Identity colours mark people.** Terracotta, ochre, plum, teal, rose and indigo appear only on avatars and handle dots, never on text, buttons or backgrounds.

## Type

Geist for people's words, Geist Mono for what a machine prints: handles, times, counts, character budgets. Post bodies are 15px with relaxed leading; the composer and a focused post are 17px. Inputs are at least 16px on phones so iOS doesn't zoom.

## Layout

A centred shell up to 1264px: a 256px side nav (an 80px icon rail on tablets), the 620px column, and a 320px aside on wide screens. Phones get a sticky header and a bottom bar. Every page starts with a sticky 56px header, with tabs underneath when there are views to switch between.

## Components

- **Rows, not cards.** Posts, people, spaces, events and notifications are rows divided by hairlines. Bordered blocks are reserved for things embedded in a post: link cards, quoted posts, events, opportunities, polls.
- **Post row.** Avatar, name, mono handle and relative time, then the body, attachments and a quiet action row (reply, quote, like, save, copy link). Long posts fold after 280 characters or 8 lines.
- **Tombstones.** A dashed circle and "[deleted] This post was deleted." keep a thread's place.
- **Empty states.** One bold line and one plain sentence, with a single action when there is somewhere to go.
- **Photos from elsewhere** (city photos) always carry their credit and licence.

## Stability

Nothing jumps. Buttons whose label changes have a minimum width, skeletons match what they stand in for, polling never moves what someone is reading (new posts wait behind a pill), and confirmations replace the control they belong to.

## Everyone can use it

- **Contrast.** Text at 4.5:1 and controls, focus rings and the j/k post bar at 3:1 in both themes. Muted text is never faded further with opacity; placeholders use `ink-muted` in full.
- **Focus.** The ring is solid primary. A post reached with j or k gets a 3px primary bar on its left edge and scrolls clear of the sticky header. Dialogs and menus return focus to what opened them.
- **Keyboard.** Dialogs are native `<dialog>` with a name from their title; the page behind does not scroll. Menus take arrow keys, Home, End, Escape and Tab. Single-key shortcuts are matched by physical key, so they work on Arabic, Amharic and other layouts, and can be turned off in Settings › Appearance.
- **Motion.** `prefers-reduced-motion: reduce` ends every transition and animation at once; nothing else needs gating.
- **Right to left.** Post bodies, messages, bios, headlines and every text input carry `dir="auto"`, and links and mentions inside a body are bidi-isolated, so Arabic and Tigrinya lay out the way their writers expect.
