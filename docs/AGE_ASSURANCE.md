# Age assurance

Mavuno is an age-restricted social media platform under Part 4A of the *Online Safety Act 2021* (the social media minimum age, in force since 10 December 2025). People under 16 must not have accounts. This file records the reasonable steps we take, why they are proportionate for a small, volunteer-run community service, and how we review them. It is our internal record for eSafety and the OAIC.

Sources: [eSafety, social media age restrictions](https://www.esafety.gov.au/about-us/industry-regulation/social-media-age-restrictions) and its regulatory guidance; [OAIC, Part 4A privacy guidance](https://www.oaic.gov.au/privacy/privacy-legislation/related-legislation/social-media-minimum-age).

## The steps, in layers

eSafety's guidance says self-declaration alone is not enough, so no single step carries the weight.

| Layer | What happens | Where |
|---|---|---|
| 1. Date of birth at sign-up | Before choosing email or Google, people enter a date of birth (day, month, year, with no hint of the cut-off). Under 16: no account is created, and the same browser can't try again for 24 hours. | `src/app/(auth)/signup`, `src/app/actions/age.ts` |
| 2. Existing accounts | Everyone who joined before the check, or through Google from the sign-in page, is asked once before they can use Mavuno. Until then the database lets them read but not post, reply, like, follow or message. | `src/app/onboarding/age`, `is_active_member()` |
| 3. Community reports | Anyone can report an account or post as "Someone under 16". | report dialog, report queue |
| 4. Moderator review | Moderators see under-16 reports, and anything they notice in posts or profiles, and can deactivate the account. Accounts with a recent report have their posts reviewed before they go public. | Moderation → Reports, Moderation → Age checks |
| 5. Deactivation with notice | The person sees a notice saying why, what happens next and how to ask for a review. Their posts, events and opportunities are hidden, they can download their data, and support services (Kids Helpline, eSafety) are listed. | `src/app/deactivated` |
| 6. Review by email | A moderator who didn't make the decision offers a choice: a short unrecorded video call, a letter from a school, TAFE, university or employer, or ID if the person prefers. Government ID is never the only option (s63DB). | Moderation → Age checks → Reinstate |
| 7. Deletion | Accounts not reinstated within 30 days are deleted with everything in them, by `purge_deactivated_accounts()` (daily with `pg_cron`, or `/api/maintenance`). | migration `age_assurance_and_notices` |

## Privacy (s63F)

- The date of birth is compared and dropped. It is never written to the database. It waits in an httpOnly cookie for at most 30 minutes only while someone signs up (Google sends them away and back), and is deleted as soon as the account exists.
- We store `profile_settings.age_confirmed_at` (that the person confirmed they are 16 or older, and when) and, if deactivated, `age_deactivated_at`. Both are in the member's data export.
- Anything someone sends for a review (an email, a letter, a photo of ID) is used only for that review and deleted once we decide. We record only the outcome and how they showed it (`video_call`, `document` or `other`).
- The under-16 cookie on the sign-up page holds no personal information.

## The record of steps

`public.age_checks` keeps what happened, on what basis, when, and which moderator acted: `declared_under_16`, `flagged`, `reinstated`, `deleted`. It has no dates of birth and no free text. Rows outlive the account, without the person's identity, so we can show eSafety what we did. Moderators see the latest 50 at Moderation → Age checks; only moderators can read it.

Moderators also see the decision in `moderation_actions` (`deactivate` and `reinstate`, rule `age`).

## Why this is proportionate

Mavuno is small, free, has no ads and no recommender system built on engagement, and is aimed at adults in African Australian communities. eSafety expects steps in proportion to a platform's size and risk. We don't use facial age estimation or third-party ID services: the cost and the privacy risk of sending members' faces or documents to a vendor outweigh the benefit at our scale. Community reports, moderators acting on what they see, and a quick, respectful review path fit how the service already works.

## Review

- **Every quarter:** an admin counts each kind of step in `age_checks` and the number of open under-16 reports, and checks that deactivated accounts are being deleted on time.
- **Every year, each October:** we re-read eSafety's and the OAIC's guidance and check each layer still works end to end (a test sign-up with an under-16 date, a moderator deactivation and a reinstatement in a staging project).
- **Straight away** when eSafety updates its guidance, sends us a notice, or when the counts suggest under-16s are getting through (for example, several under-16 reports in a month). If that happens, the next step to consider is an age estimation provider that deletes images straight after the check, offered alongside the existing options.

Last reviewed: 20 October 2026.
