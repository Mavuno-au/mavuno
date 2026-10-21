import Link from "next/link";
import type { ReactNode } from "react";
import { helpHref, type HelpSlug } from "@/lib/help";
import { APPEAL_DAYS } from "@/lib/rules";
import { CONTACT_EMAIL, OPERATOR } from "@/lib/site";

export type HelpSection = { heading: string; body: ReactNode };
export type HelpContent = { lead: ReactNode; sections: readonly HelpSection[]; related: readonly HelpSlug[] };

const Email = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

// Keyed by slug, so an article listed in src/lib/help.ts without words here,
// or the reverse, fails to compile.
export const HELP_CONTENT: Record<HelpSlug, HelpContent> = {
  review: {
    lead: <p>A post sent for review is visible to you and nobody else until a moderator has read it. Most are checked within a day.</p>,
    sections: [
      {
        heading: "Why a post is sent for review",
        body: (
          <>
            <p>Posts go up straight away on Mavuno. One is held for a moderator only when:</p>
            <ul>
              <li>your account was reported in the past week and the report wasn't dismissed. Your new posts, events and opportunities are checked until the week is up.</li>
              <li>an admin is holding new members' posts during a wave of spam.</li>
            </ul>
          </>
        ),
      },
      {
        heading: "What happens next",
        body: (
          <>
            <p>You don't need to post it again. If a moderator approves it, it appears for everyone. If they don't, you get a notice in your notifications that names the rule it broke.</p>
            <p>
              If you think a decision was wrong, you can <Link href={helpHref("appeals")}>appeal it</Link>.
            </p>
          </>
        ),
      },
    ],
    related: ["listings", "removed-posts", "appeals"],
  },

  "deleting-posts": {
    lead: <p>You can delete any of your posts at any time, and undo it for 30 seconds. Posts can't be edited.</p>,
    sections: [
      {
        heading: "How to delete a post",
        body: (
          <ol>
            <li>Open the menu on your post and select <strong>Delete</strong>.</li>
            <li>Confirm. The post disappears, with an <strong>Undo</strong> button for 30 seconds.</li>
          </ol>
        ),
      },
      {
        heading: "What happens to replies",
        body: <p>Replies other people wrote stay. Your post is replaced by a [deleted] placeholder with no name on it, so the conversation still makes sense.</p>,
      },
      {
        heading: "Why posts can't be edited",
        body: <p>A reply should always answer what was actually written. If you spot a mistake, delete the post and write it again.</p>,
      },
    ],
    related: ["review", "delete-your-account"],
  },

  listings: {
    lead: <p>Events and opportunities go up straight away for most members. A listing that is held for review is visible only to its hosts, on its own page, until a moderator decides.</p>,
    sections: [
      {
        heading: "What an opportunity needs",
        body: (
          <>
            <p>
              Jobs, internships and other opportunities follow <Link href="/rules#opportunities">rule 4 of the community rules</Link>. The most common reasons one isn't approved:
            </p>
            <ul>
              <li>it doesn't say whether the work is paid</li>
              <li>it asks applicants for money, bank details, passport copies or a tax file number</li>
              <li>it describes a job as a contract to avoid paying wages, super or tax</li>
            </ul>
          </>
        ),
      },
      {
        heading: "If your listing wasn't approved",
        body: (
          <>
            <p>The listing's page tells you why. Edit the listing to fix it. Changing an approved listing's words or links can send it back for review, like a new listing.</p>
            <p>
              If you think the decision was wrong, you can <Link href={helpHref("appeals")}>appeal it</Link>.
            </p>
          </>
        ),
      },
    ],
    related: ["review", "appeals"],
  },

  reporting: {
    lead: <p>You can report any post, reply, profile, message, event or opportunity. The person you report is never told who reported them.</p>,
    sections: [
      {
        heading: "How to report",
        body: (
          <ol>
            <li>
              Open the menu on the post or profile and select <strong>Report post</strong> or <strong>Report profile</strong>. In a message, select <strong>Report message</strong>.
            </li>
            <li>Choose what's wrong, and add details if they help.</li>
            <li>
              Select <strong>Report</strong>.
            </li>
          </ol>
        ),
      },
      {
        heading: "What happens after you report",
        body: (
          <ul>
            <li>A moderator looks at every report.</li>
            <li>If three members in good standing report the same thing, it's hidden straight away until a moderator decides.</li>
            <li>If a moderator agrees with the report, they act under the community rules, and the person's new posts are checked before they go public for a week.</li>
          </ul>
        ),
      },
      {
        heading: "When to go beyond Mavuno",
        body: (
          <ul>
            <li>In an emergency, call 000.</li>
            <li>
              If you've reported serious abuse and we haven't dealt with it within 48 hours, report it to{" "}
              <a href="https://www.esafety.gov.au/report" target="_blank" rel="noopener noreferrer">
                eSafety
              </a>
              .
            </li>
            <li>If someone has shared intimate images of you, go to eSafety straight away.</li>
          </ul>
        ),
      },
    ],
    related: ["mute-and-block", "removed-posts"],
  },

  "invite-friends": {
    lead: <p>Your invite link brings friends straight to you. When someone joins with it, you follow each other, and you're told so you can welcome them.</p>,
    sections: [
      {
        heading: "How to invite friends",
        body: (
          <ol>
            <li>Go to your profile, or Home while your feed is quiet. On a wide screen it's also in the side column.</li>
            <li>
              Select <strong>Invite friends</strong> to share your link, or <strong>Send on WhatsApp</strong> to send a ready-made message to a chat or group.
            </li>
          </ol>
        ),
      },
      {
        heading: "What happens when a friend joins",
        body: (
          <p>
            Once they've confirmed their email address, you follow each other and you get a notification with a <strong>Say welcome</strong> button. Either of you can unfollow, mute or{" "}
            <Link href={helpHref("mute-and-block")}>block</Link> the other at any time.
          </p>
        ),
      },
      {
        heading: "Who can see who invited whom",
        body: <p>Only the two of you. It shows on each other's profiles as Invited you or Joined from your invite. Mavuno's admins see how many people joined with an invite, never who.</p>,
      },
      {
        heading: "If your link stops working",
        body: <p>Your link is mavuno.au/join/ followed by your username, so changing your username changes it. An old link still leads to the sign-up page, just without your name.</p>,
      },
    ],
    related: ["mute-and-block", "download-your-data"],
  },

  "mute-and-block": {
    lead: <p>Muting hides someone from you. Blocking separates you both ways. Neither person is told.</p>,
    sections: [
      {
        heading: "How to mute or block someone",
        body: (
          <ol>
            <li>Open the menu on one of their posts, or on their profile.</li>
            <li>
              Select <strong>Mute @username</strong> or <strong>Block @username</strong>.
            </li>
          </ol>
        ),
      },
      {
        heading: "What muting does",
        body: <p>Their posts, replies and mentions stop appearing in your feeds, threads, search, suggestions and notifications. They can still see your posts and reply to them.</p>,
      },
      {
        heading: "What blocking does",
        body: <p>Everything muting does, and they can no longer see your posts, follow you or message you. That includes acting through an organisation they help run.</p>,
      },
      {
        heading: "How to undo it",
        body: (
          <p>
            Go to <Link href="/settings/safety">Settings › Safety</Link>. Everyone you've muted or blocked is listed under <strong>Muted</strong> and <strong>Blocked</strong>.
          </p>
        ),
      },
    ],
    related: ["reporting", "message-requests"],
  },

  "message-requests": {
    lead: <p>A message from someone you don't follow goes to Requests, not your inbox. They can send one message until you accept.</p>,
    sections: [
      {
        heading: "How to answer a request",
        body: (
          <>
            <p>
              Open <strong>Requests</strong> in Messages and open the conversation. Choose <strong>Accept</strong> to start talking, or <strong>Decline</strong>. They don't see that you've read it
              unless you accept, and declining is private.
            </p>
            <p>
              You can also <strong>Block</strong> or <strong>Report</strong> them from the same place.
            </p>
          </>
        ),
      },
      {
        heading: "How to choose who can message you",
        body: (
          <>
            <p>
              Go to <Link href="/settings/privacy">Settings › Privacy</Link> and pick one:
            </p>
            <ul>
              <li>
                <strong>Everyone</strong>: people you don't follow land in Requests.
              </li>
              <li>
                <strong>People I follow</strong>: only they can start a conversation.
              </li>
              <li>
                <strong>Nobody</strong>: no new conversations. The ones you have carry on.
              </li>
            </ul>
          </>
        ),
      },
    ],
    related: ["mute-and-block", "reporting"],
  },

  "removed-posts": {
    lead: <p>When a moderator removes something you posted, you get a notice in your notifications that names the community rule it broke.</p>,
    sections: [
      {
        heading: "What the notice tells you",
        body: <p>What was removed, which rule it was under with a link to that rule, and how long you have to appeal. Replies other people wrote under it stay, under a placeholder.</p>,
      },
      {
        heading: "What happens next",
        body: (
          <p>
            For most first problems, nothing more. Breaking the rules again can lead to a <Link href={helpHref("suspensions")}>suspension</Link>. The most serious harm, such as credible threats,
            doxxing, or scams that take people's money, leads to a <Link href={helpHref("bans")}>ban</Link>.
          </p>
        ),
      },
    ],
    related: ["appeals", "suspensions"],
  },

  suspensions: {
    lead: <p>A suspension stops an account from taking part for a set time, from an hour to 30 days. It ends on its own.</p>,
    sections: [
      {
        heading: "Why accounts are suspended",
        body: (
          <p>
            For breaking the <Link href="/rules">community rules</Link> more than once, or for a serious first break. The notice in your notifications says which rule and when the suspension ends.
            A second suspension adds to the first.
          </p>
        ),
      },
      {
        heading: "What you can do while suspended",
        body: (
          <>
            <p>You can read Mavuno, download your data and appeal. You can't post, reply, like, follow or message.</p>
            <p>Your existing posts stay up, but you're left out of suggestions and people lists. A scheduled post due during the suspension isn't posted.</p>
          </>
        ),
      },
      {
        heading: "Deleting your account while suspended",
        body: (
          <p>
            You can. A scrambled form of your email address and sign-in is kept until the suspension would have ended, so the same person can't sign up again in the meantime.{" "}
            <Link href={helpHref("delete-your-account", "What stays")}>What stays</Link> explains.
          </p>
        ),
      },
    ],
    related: ["appeals", "bans", "removed-posts"],
  },

  bans: {
    lead: <p>A ban doesn't end. A banned account can read the decision, appeal, download its data and delete itself, and nothing else.</p>,
    sections: [
      {
        heading: "Why accounts are banned",
        body: <p>For the most serious harm, such as sexual content involving anyone under 18, credible threats, doxxing, or scams that take people's money. These may also be reported to the police.</p>,
      },
      {
        heading: "What happens to your posts",
        body: <p>They're hidden from everyone. Scheduled posts that haven't gone out are cancelled. If an appeal succeeds, your account and posts come back.</p>,
      },
      {
        heading: "Why a ban outlives the account",
        body: (
          <p>
            If you delete a banned account, Mavuno keeps a scrambled form of its email address and sign-in, and nothing else, so the same identity can't join again. Nothing can be read back
            from it. The <Link href="/privacy">privacy policy</Link> has the detail.
          </p>
        ),
      },
    ],
    related: ["appeals", "suspensions"],
  },

  appeals: {
    lead: (
      <p>
        If you think a moderator got a decision wrong, you have {APPEAL_DAYS} days from the notice to ask for another look. A different moderator from the one who decided reviews it.
      </p>
    ),
    sections: [
      {
        heading: "How to appeal",
        body: (
          <ol>
            <li>Open the notice in your notifications.</li>
            <li>
              Select <strong>Think we got it wrong?</strong>, then <strong>Email your appeal</strong>. The email is started for you, with a link to the notice.
            </li>
            <li>Say why you think it was a mistake, and send it.</li>
          </ol>
        ),
      },
      {
        heading: "If you can't use the button",
        body: (
          <p>
            Email <Email /> with your username, a link to the notice if you have it, and why you think the decision was wrong. Banned accounts can do the same from the page they see when they
            sign in.
          </p>
        ),
      },
      {
        heading: "What happens next",
        body: (
          <p>
            We aim to reply within 7 days. If the decision was wrong, what was removed comes back, or your account is restored. If the {APPEAL_DAYS} days have passed and something stopped you
            appealing in time, email anyway and tell us what.
          </p>
        ),
      },
    ],
    related: ["removed-posts", "suspensions", "bans"],
  },

  "age-check": {
    lead: <p>Australian law doesn't allow people under 16 to have social media accounts, so Mavuno is for people 16 and over.</p>,
    sections: [
      {
        heading: "What we check when you sign up",
        body: <p>You enter your date of birth. It's compared and dropped, never stored. Mavuno keeps only that you confirmed you're 16 or older, and when.</p>,
      },
      {
        heading: "If we believe someone is under 16",
        body: (
          <p>
            Anyone can report an account as someone under 16, and moderators act on what they see. A deactivated account gets a notice saying why. Its posts are hidden, and it's deleted after
            30 days unless a review finds the person is 16 or older.
          </p>
        ),
      },
      {
        heading: "How to ask for a review",
        body: (
          <>
            <p>
              Email <Email /> with your username before the deletion date on your notice. A moderator will reply and ask you to show your age in one of these ways. You choose:
            </p>
            <ul>
              <li>a short video call with one of our team, which we don't record</li>
              <li>a letter or email from your school, TAFE, university or employer</li>
              <li>ID, such as a licence or passport, only if you prefer. We never require government ID.</li>
            </ul>
            <p>We use what you show us only to check your age, and delete it once we've decided.</p>
          </>
        ),
      },
    ],
    related: ["download-your-data", "delete-your-account"],
  },

  "download-your-data": {
    lead: <p>Your data export is a single file with everything Mavuno holds about you.</p>,
    sections: [
      {
        heading: "How to download your data",
        body: (
          <ol>
            <li>
              Go to <Link href="/settings/account">Settings › Account</Link>.
            </li>
            <li>
              Under <strong>Download your data</strong>, select <strong>Download my data</strong>.
            </li>
          </ol>
        ),
      },
      {
        heading: "What's in it",
        body: (
          <p>
            A JSON file with your profile, settings, posts, likes, saved posts, follows, mutes, blocks, spaces, events, opportunities, the messages you sent and your notifications. Images are
            included as links. You can download it 3 times an hour. Keep it private.
          </p>
        ),
      },
    ],
    related: ["delete-your-account", "location-and-photos"],
  },

  "delete-your-account": {
    lead: <p>Deleting your account is permanent and can't be undone. Download your data first if you want a copy.</p>,
    sections: [
      {
        heading: "How to delete your account",
        body: (
          <ol>
            <li>
              Go to <Link href="/settings/account">Settings › Account</Link>.
            </li>
            <li>
              Under <strong>Delete your account</strong>, select <strong>Delete account</strong>.
            </li>
            <li>
              Type your username to confirm, then select <strong>Delete my account</strong>.
            </li>
          </ol>
        ),
      },
      {
        heading: "What's deleted",
        body: (
          <p>
            Your profile, posts, replies, likes, follows, the messages you sent and the images you uploaded. Organisations you own on your own are deleted too, so hand them over first if they
            should carry on.
          </p>
        ),
      },
      {
        heading: "What stays",
        body: (
          <>
            <p>Replies other people wrote under your posts, under a [deleted] placeholder.</p>
            <p>
              If your account is banned, or you delete it while it's suspended, a scrambled form of your email address and sign-in is kept until the ban or suspension would have ended. It stops
              the same person signing up again, and nothing can be read back from it.
            </p>
          </>
        ),
      },
    ],
    related: ["download-your-data", "organisations"],
  },

  "location-and-photos": {
    lead: <p>Mavuno knows the city on your profile, if you set one, and nothing more precise.</p>,
    sections: [
      {
        heading: "Your city",
        body: <p>Mavuno never asks for your location. Nearby works from the city on each profile. To stay out of Nearby and suggestions, turn off <strong>Show me in Nearby and in suggestions</strong> in Settings › Privacy.</p>,
      },
      {
        heading: "Your photos",
        body: <p>Every photo is re-encoded on our server before it's stored. That removes the location and camera details phones add to pictures.</p>,
      },
      {
        heading: "Your email address",
        body: (
          <p>
            It's never shown to anyone. The <Link href="/privacy">privacy policy</Link> lists everything we collect and who can see it.
          </p>
        ),
      },
    ],
    related: ["download-your-data", "delete-your-account"],
  },

  organisations: {
    lead: <p>An organisation, such as a community association, church or business, has its own profile, run by a team of people.</p>,
    sections: [
      {
        heading: "How to create an organisation",
        body: (
          <ol>
            <li>
              Go to <Link href="/settings/organisations">Settings › Organisations</Link>.
            </li>
            <li>
              Fill in its name and details, then select <strong>Create organisation</strong>.
            </li>
          </ol>
        ),
      },
      {
        heading: "Posting as an organisation",
        body: <p>Switch who you're posting as in the composer. Posts, events and opportunities then appear under the organisation's name.</p>,
      },
      {
        heading: "Team roles",
        body: (
          <ul>
            <li>
              <strong>Owners</strong> add and remove people and can hand the organisation over.
            </li>
            <li>
              <strong>Admins</strong> manage its profile and team.
            </li>
            <li>
              <strong>Editors</strong> post as it.
            </li>
          </ul>
        ),
      },
      {
        heading: "Accepting an invitation",
        body: (
          <p>
            When someone adds you to a team, the invitation appears in Settings › Organisations. Select <strong>Accept</strong> or <strong>Decline</strong>. Nothing changes until you accept.
          </p>
        ),
      },
    ],
    related: ["delete-your-account", "contact"],
  },

  contact: {
    lead: (
      <p>
        Email <Email />. A person at {OPERATOR}, the community organisation that runs Mavuno, reads every message.
      </p>
    ),
    sections: [
      {
        heading: "When to expect a reply",
        body: <p>We aim to reply within 7 days, and sooner for anything about someone's safety.</p>,
      },
      {
        heading: "What to include",
        body: <p>Your username, and a link to the post, profile or notice it's about. There's no ticket number to quote.</p>,
      },
      {
        heading: "Security problems",
        body: <p>Use the same address. Tell us what you found and how to see it, and give us time to fix it before you tell anyone else.</p>,
      },
      {
        heading: "Help outside Mavuno",
        body: (
          <p>
            Emergencies, scams and racial vilification have their own services, listed at the end of the <Link href="/rules">community rules</Link>.
          </p>
        ),
      },
    ],
    related: ["appeals", "reporting"],
  },
};
