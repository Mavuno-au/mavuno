import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page";
import { Note, Prose } from "@/components/ui/prose";
import { HELP_SECTIONS, type HelpSlug } from "@/lib/help";
import { APPEAL_DAYS } from "@/lib/rules";
import { CONTACT_EMAIL, OPERATOR } from "@/lib/site";

export const metadata: Metadata = {
  title: "Help",
  description: "Plain answers about posting, review, reports, suspensions and appeals, the age check, your data, and how to reach a person at Mavuno.",
};

const mailto = `mailto:${CONTACT_EMAIL}`;

// One answer per question in src/lib/help.ts. The type keeps the two lists
// in step: a question without an answer, or the reverse, fails to compile.
const ANSWERS: Record<HelpSlug, ReactNode> = {
  "sent-for-review": (
    <>
      <p>
        Your post is up for you, and nobody else, until a moderator has read it. That usually takes less than a day. You don't need to post it again: once it's approved it appears for
        everyone, and if it isn't you get a notice saying which rule it broke.
      </p>
      <p>Posts go up straight away on Mavuno. Two things put one in front of a moderator first:</p>
      <ul>
        <li>your account was reported in the past week and the report wasn't dismissed, so your new posts, events and opportunities are checked for that week, or</li>
        <li>an admin is holding new members' posts for a while during a wave of spam.</li>
      </ul>
      <p>An event or opportunity waits the same way. Until it's approved only its hosts can see it, on its own page.</p>
    </>
  ),
  "edit-a-post": (
    <>
      <p>
        Posts can't be changed once they're up, so what someone replied to stays what they replied to. If you spot a mistake, delete the post and write it again. Delete has a 30-second undo
        in case you change your mind.
      </p>
      <p>A deleted post leaves a [deleted] placeholder, with no author, so replies under it survive.</p>
    </>
  ),
  "not-approved": (
    <>
      <p>
        The notice on the listing says why, and which rule it was under. Most often it's{" "}
        <Link href="/rules#opportunities">rule 4</Link>: a job or scholarship has to name who is offering it, say what it pays or that it's unpaid, and never ask people to pay to apply.
      </p>
      <p>
        Fix it by editing the listing. An edit to its words or links goes through review again, like a new listing. Only its hosts can see it in the meantime. If you think the decision was
        a mistake, <Link href="#appeal">appeal it</Link>.
      </p>
    </>
  ),
  report: (
    <>
      <p>
        Open the menu on a post, reply, profile, message, event or opportunity and choose Report. Pick what's wrong and add a note if it helps. The person you report is never told who
        reported them.
      </p>
      <p>
        A moderator looks at every report. When three members in good standing report the same thing, it's hidden straight away until a moderator decides. If the report stands, the person's
        new posts are checked before they go public for a week.
      </p>
      <p>
        If you've reported serious abuse and we haven't dealt with it within 48 hours, report it to <a href="https://www.esafety.gov.au/report" target="_blank" rel="noopener noreferrer">eSafety</a>{" "}
        as well. For intimate images shared without consent, go to eSafety straight away. In an emergency, call 000.
      </p>
    </>
  ),
  "mute-block": (
    <>
      <p>
        <strong>Mute</strong> hides someone from you: their posts, replies, mentions and messages stop showing up in your feeds, threads, search, suggestions and notifications. They can still see
        you.
      </p>
      <p>
        <strong>Block</strong> does that both ways. They can't see your posts, follow you or message you, including through an organisation they help run. Neither is told. Both are listed in{" "}
        <Link href="/settings/safety">Settings › Safety</Link>, where you can undo them.
      </p>
    </>
  ),
  "message-requests": (
    <>
      <p>
        A message from someone you don't follow lands in Requests rather than your inbox. Accept it to start the conversation, or decline it and they're not told. Someone you've blocked
        can't message you at all.
      </p>
      <p>
        You can choose who may message you in <Link href="/settings/privacy">Settings › Privacy</Link>: everyone, only people you follow, or nobody.
      </p>
    </>
  ),
  removed: (
    <>
      <p>
        When a moderator removes a post, you get a notice in your <Link href="/notifications">notifications</Link>. It says what was removed and which{" "}
        <Link href="/rules">community rule</Link> it broke, with a link to the rule. Replies other people wrote under it stay, under a placeholder.
      </p>
      <p>
        For most first problems that's all that happens. Repeated breaks lead to a <Link href="#suspended">suspension</Link>, and the most serious harm to a <Link href="#banned">ban</Link>. If
        you think we got it wrong, you can <Link href="#appeal">appeal</Link>.
      </p>
    </>
  ),
  suspended: (
    <>
      <p>
        A suspension lasts a set time, from an hour to 30 days. While it runs you can read Mavuno, download your data and appeal, but you can't post, reply, like, follow or message. Your posts
        stay up, but you're left out of suggestions and people lists, and a scheduled post due in that time isn't posted. A second suspension adds to the first.
      </p>
      <p>
        The notice in your <Link href="/notifications">notifications</Link> says when it ends and which rule it was under. If you think it was a mistake, <Link href="#appeal">appeal</Link>.
      </p>
    </>
  ),
  banned: (
    <>
      <p>
        A ban doesn't end. You can read the decision, appeal it, download your data and delete the account, and nothing else. Your posts are hidden.
      </p>
      <p>
        A ban outlives the account. If you delete it, we keep a scrambled form of your email address and sign-in, and nothing else, so the same identity can't join again. The{" "}
        <Link href="/privacy">privacy policy</Link> explains what that scrambled form is and that nothing can be read back from it.
      </p>
    </>
  ),
  appeal: (
    <>
      <p>
        Email <a href={mailto}>{CONTACT_EMAIL}</a> within {APPEAL_DAYS} days of the notice. Include your username, a link to the notice, and why you think the decision was a mistake. Each
        notice has an Appeal button that starts the email for you.
      </p>
      <p>
        A different moderator from the one who decided looks at it again, and we aim to reply within 7 days. If we got it wrong, what was removed comes back, or your account is restored. If
        the {APPEAL_DAYS} days have passed and something stopped you, email anyway and tell us what.
      </p>
    </>
  ),
  age: (
    <>
      <p>
        Australian law doesn't allow people under 16 to have social media accounts, so Mavuno is for people 16 and over. When you sign up you enter your date of birth. We compare it and
        drop it: it's never stored. We keep only that you confirmed you're 16 or older, and when.
      </p>
      <p>
        Anyone can report an account as someone under 16, and moderators act on what they see. If we believe you're under 16, your account is deactivated with a notice, your posts are
        hidden, and the account is deleted after 30 days unless a review finds otherwise.
      </p>
      <p>
        To ask for a review, email <a href={mailto}>{CONTACT_EMAIL}</a> with your username. You choose how to show your age: a short video call we don't record, a letter or email from your
        school, TAFE, university or employer, or ID only if you'd prefer that. We never require government ID, and we delete whatever you show us once we've decided.
      </p>
    </>
  ),
  export: (
    <>
      <p>
        Go to <Link href="/settings/account">Settings › Account</Link> and choose Download your data. You get a JSON file with your profile, settings, posts, likes, saved posts, follows, mutes,
        blocks, spaces, events, opportunities, the messages you sent and your notifications. Images are included as links.
      </p>
      <p>Everything we hold about you is in it. Keep it private: it's yours alone.</p>
    </>
  ),
  "delete-account": (
    <>
      <p>
        Go to <Link href="/settings/account">Settings › Account</Link> and choose Delete your account. It can't be undone, so download your data first if you want a copy.
      </p>
      <p>
        Your profile, posts, replies, likes, follows, the messages you sent and the images you uploaded are deleted for good. Replies other people wrote under your posts stay, under a
        [deleted] placeholder. Organisations you own on your own are deleted too, so hand them over first if they should carry on.
      </p>
      <p>
        One exception: if your account is banned, or you delete it while it's suspended, we keep a scrambled form of your email address and sign-in until the ban or suspension would have
        ended, so the same person can't simply sign up again. Nothing can be read back from it.
      </p>
    </>
  ),
  location: (
    <>
      <p>
        Your city, if you've set one, and nothing more precise. Mavuno never asks for your location, and Nearby works from the city on your profile. Photos are re-encoded on our server
        before they're stored, which strips the location and camera details phones put in them.
      </p>
      <p>
        Your email address is never shown to anyone. The <Link href="/privacy">privacy policy</Link> lists everything we collect and who can see it.
      </p>
    </>
  ),
  organisations: (
    <>
      <p>
        An organisation, such as a community association, a church or a business, has its own profile run by a team of people. Create one in{" "}
        <Link href="/settings/organisations">Settings › Organisations</Link>. Its posts, events and opportunities appear under the organisation's name, and you switch who you're posting as
        in the composer.
      </p>
      <p>
        Owners can add people to the team and hand over the organisation, admins can manage it, and editors can post as it. When someone adds you, you get an invitation to accept or
        decline in Settings › Organisations. You act for the organisation only once you've accepted.
      </p>
    </>
  ),
  contact: (
    <>
      <p>
        Email <a href={mailto}>{CONTACT_EMAIL}</a>. A person at {OPERATOR}, the community organisation that runs Mavuno, reads every message. We aim to reply within 7 days, and sooner for
        anything about safety.
      </p>
      <p>
        Include your username and, if it's about a decision, a link to the notice. There's no ticket system and no bot: you're writing to the people who run the site. If you want to tell
        someone about a security problem, the same address works.
      </p>
      <p>
        Emergencies, abuse beyond Mavuno, scams and racial vilification have their own places to go, listed at the end of the <Link href="/rules">community rules</Link>.
      </p>
    </>
  ),
};

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" />
      <Prose>
        <p>Plain answers to the questions people ask us most. Each answer has its own address, so you can send a link to the one you mean.</p>
        <Note>
          <strong>Can't find it?</strong> Email <a href={mailto}>{CONTACT_EMAIL}</a>. A person reads every message, and we aim to reply within 7 days.
        </Note>

        <nav aria-label="Questions" className="grid gap-3">
          {HELP_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{section.title}</p>
              <ul className="mt-1">
                {section.topics.map((topic) => (
                  <li key={topic.slug}>
                    <a href={`#${topic.slug}`}>{topic.question}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {HELP_SECTIONS.map((section) => (
          <section key={section.title} className="grid gap-4">
            <h2>{section.title}</h2>
            {section.topics.map((topic) => (
              <article key={topic.slug} className="grid gap-3">
                <h3 id={topic.slug} className="group flex items-baseline gap-2">
                  {topic.question}
                  <a href={`#${topic.slug}`} aria-label={`Link to “${topic.question}”`} className="font-normal text-ink-muted opacity-0 group-hover:opacity-100 focus:opacity-100">
                    #
                  </a>
                </h3>
                {ANSWERS[topic.slug]}
              </article>
            ))}
          </section>
        ))}
      </Prose>
    </>
  );
}
