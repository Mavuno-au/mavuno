import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { Note, Prose } from "@/components/ui/prose";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy", description: "What Mavuno collects about you, why, who can see it, where it's stored, and how to get it or delete it." };

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy policy" meta={`Last updated ${LEGAL_UPDATED}`} />
      <Prose>
        <p>
          This policy explains what personal information Mavuno collects, why, who can see it, where it's kept and the choices you have. Mavuno is run by {OPERATOR} ("we"). We follow the Australian
          Privacy Principles in the <em>Privacy Act 1988</em>.
        </p>
        <Note>
          <strong>In short:</strong> we collect what's needed to run a social network and keep it safe, nothing more. We don't sell your information or show ads. We only ever know the city you choose, never
          where you are. You can download everything we hold about you, or delete it, at any time.
        </Note>
        <p>
          <em>Why this matters:</em> what you share here can say a lot about you: where you live, your heritage, your faith, your visa or work situation. For people from migrant communities, that
          information can be used against them. So we keep as little as we can and are specific about every piece.
        </p>

        <h2>What we collect</h2>
        <h3>When you join</h3>
        <ul>
          <li>Your email address and a password, which we store only as a secure hash. Or, if you continue with Google, the name, email address and profile photo Google shares with us.</li>
          <li>Your name and username.</li>
          <li>That you confirmed you're 16 or older, and when. We ask for your date of birth to check this, but we don't keep it.</li>
        </ul>
        <h3>What you choose to add</h3>
        <ul>
          <li>Profile details: photo, banner, bio, city, heritage, languages, interests, pronouns, work and links. Everything on your profile is public.</li>
          <li>
            Some of these, such as heritage, languages, or the faith spaces you join, can reveal your racial or ethnic origin or religious beliefs. That's sensitive information under the Privacy Act. All
            of it is optional, and we only collect it because you choose to add it.
          </li>
        </ul>
        <h3>What you do on Mavuno</h3>
        <ul>
          <li>Posts, replies, quotes, photos and their descriptions, polls, events, opportunities, spaces, and posts you schedule for later.</li>
          <li>Private messages and photos you send in them.</li>
          <li>Who you follow, mute and block; your likes, saved posts, poll votes and event RSVPs; spaces you join; reports you make.</li>
          <li>Your settings: who can message you, read receipts, whether you appear in Nearby and suggestions, and your languages.</li>
        </ul>
        <h3>Collected automatically</h3>
        <ul>
          <li>The last day you used Mavuno, so we can count how many members are active. It's never shown to anyone, and the daily totals we keep have no names attached.</li>
          <li>Your IP address and browser details, which our hosting provider records in sign-in and security logs.</li>
          <li>The cookies and browser storage described below.</li>
        </ul>
        <h3>From other people</h3>
        <ul>
          <li>Members can mention you, reply to you, add you to a group conversation or an organisation's team, and report your content.</li>
        </ul>

        <h2>Who can see what</h2>
        <ul>
          <li>
            <strong>Public, including to people who aren't signed in and to search engines:</strong> your profile, published posts and replies, who you follow and who follows you, the spaces you've
            joined, events and opportunities, and your RSVP to an event.
          </li>
          <li>
            <strong>Only the people in the conversation:</strong> private messages. Moderators see a copy of a message only when someone in that conversation reports it.
          </li>
          <li>
            <strong>Not shown publicly:</strong> which posts you liked (the author may be told you liked their post), how you voted in a poll (only totals are shown, and only after you vote or the poll
            closes), what you saved, and who you muted or blocked.
          </li>
          <li>
            <strong>Only you:</strong> your email address, your settings, and posts you've scheduled until they go out.
          </li>
          <li>
            <strong>Moderators:</strong> reports and the content reported, posts waiting for review, and records of past moderation decisions. They can't see who made a report.
          </li>
        </ul>

        <h2>Why we use it</h2>
        <ul>
          <li>To run Mavuno: show your profile and posts, deliver messages and notifications, and let you sign in.</li>
          <li>To suggest people, spaces and posts, using your city, interests and who you follow. You can turn suggestions off.</li>
          <li>To keep the community safe: review new members' posts, act on reports, stop spam and scams, and enforce the <Link href="/rules">community rules</Link>.</li>
          <li>To send emails about your account, such as confirming your address or resetting your password. We don't send marketing email.</li>
          <li>To understand, in anonymous totals, whether Mavuno is working: how many people join, come back and get replies.</li>
        </ul>
        <p>We don't use your information for advertising, we don't sell it, and we don't use your posts or messages to train AI models.</p>

        <h2>Decisions made automatically</h2>
        <p>Some decisions are made by rules in our software rather than by a person:</p>
        <ul>
          <li>A new member's first post, event or opportunity is held for a moderator to check before it's public. So are posts from an account reported in the past week, unless the report was dismissed.</li>
          <li>Anything reported by three different people is hidden until a moderator reviews it.</li>
          <li>Limits on how often you can post or send message requests to people you don't know, to stop spam.</li>
        </ul>
        <p>
          A person always makes the final decision to remove content or suspend an account. If something of yours was held or hidden and you think that's wrong, email {mail}.
        </p>

        <h2>Where it's stored, and who helps us</h2>
        <p>We use a small number of service providers. Some of them are outside Australia, and we've listed the countries:</p>
        <ul>
          <li>
            <strong>Supabase</strong> stores our database, sign-in and uploaded photos. They're hosted on Amazon Web Services in <strong>Mumbai, India</strong>. Supabase is a US company, and its staff in
            the United States may access our systems to provide support.
          </li>
          <li>
            <strong>Google</strong>, in the United States, if you choose to continue with Google.
          </li>
          <li>
            <strong>Translation:</strong> when you press Translate, the post opens in Google Translate in your browser, which sends its text to Google. If we add a built-in translation service, we'll name
            it here first.
          </li>
          <li>
            <strong>Fathom Analytics</strong>, if enabled: anonymous visit counts processed in the United States. Fathom uses no cookies and can't identify you.
          </li>
          <li>Videos from YouTube and similar sites only load from them when you press play.</li>
        </ul>
        <p>We stay responsible for how these providers handle your information. They may only use it to provide their service to us.</p>
        <p>
          We may also share information when the law requires it: with eSafety when it issues a notice; with the police where someone's safety is at risk; and in reports of child sexual abuse material.
        </p>

        <h2>How we protect it</h2>
        <ul>
          <li>Everything is encrypted in transit and stored encrypted. Passwords are hashed, never stored as written.</li>
          <li>Database rules decide who can read each row, so private messages and settings can't be read by other members even through our API.</li>
          <li>Photos are re-encoded in your browser before they upload, which removes the location and camera details phones attach.</li>
          <li>Only a small number of moderators and administrators have extra access, and their moderation actions are recorded.</li>
        </ul>
        <p>If a data breach is likely to cause serious harm, we'll tell the people affected and the Office of the Australian Information Commissioner (OAIC) as quickly as we can.</p>

        <h2>How long we keep it</h2>
        <ul>
          <li>Your account and content stay until you delete them.</li>
          <li>A post you delete is erased once its 30-second undo has passed. Replies from other people stay, under a "deleted" placeholder.</li>
          <li>
            When you delete your account, we immediately erase your profile, posts, likes, the messages you sent, your photos and your scheduled posts. Copies in our provider's backups are overwritten
            when those backups expire.
          </li>
          <li>Translations we've saved are deleted after 7 days.</li>
          <li>We keep a record of moderation decisions (what was decided and why) so decisions stay consistent and can be reviewed.</li>
        </ul>

        <h2>Age</h2>
        <p>
          You need to be 16 or older to have a Mavuno account. If we believe an account belongs to someone under 16, we'll deactivate it and delete its information. Any information collected to check
          someone's age is used only for that check and then destroyed. If your account was closed by mistake, email {mail}.
        </p>

        <h2>Cookies and browser storage</h2>
        <ul>
          <li>Sign-in cookies, to keep you signed in. These are necessary.</li>
          <li>A small cookie that records the day you were last counted as active, so it happens at most once a day.</li>
          <li>
            While you sign up, your date of birth is kept in a cookie for up to 30 minutes, so the age check works when you continue with Google. It's deleted as soon as your account is
            created. If you tell us you're under 16, a cookie without any personal details stops that browser signing up again for 24 hours.
          </li>
          <li>Your theme, and drafts of posts you haven't finished, are kept in your own browser. Drafts are cleared when you sign out.</li>
        </ul>
        <p>We don't use advertising or cross-site tracking cookies.</p>

        <h2>Your choices and rights</h2>
        <ul>
          <li>
            <strong>Get a copy</strong> of everything we hold about you from <Link href="/settings/account">Settings → Account</Link>.
          </li>
          <li>
            <strong>Correct</strong> your profile at any time in <Link href="/settings">Settings</Link>. For anything you can't change yourself, email us.
          </li>
          <li>
            <strong>Delete</strong> your account from <Link href="/settings/account">Settings → Account</Link>.
          </li>
          <li>
            <strong>Limit who reaches you:</strong> turn off Nearby and suggestions and choose who can message you in <Link href="/settings/privacy">Settings → Privacy</Link>. Mute or block anyone.
          </li>
          <li>You can use Mavuno under a name that isn't your legal name, as long as you're not pretending to be someone else.</li>
        </ul>
        <p>For any privacy request, email {mail}. It's free, and we'll reply within 30 days.</p>

        <h2>Complaints</h2>
        <p>
          If you're unhappy with how we've handled your information, email {mail} and we'll respond within 30 days. If you're not satisfied with our answer, you can complain to the{" "}
          <a href="https://www.oaic.gov.au/privacy/privacy-complaints" target="_blank" rel="noopener noreferrer">OAIC</a> on 1300 363 992.
        </p>

        <h2>Changes to this policy</h2>
        <p>When we make a significant change, we'll update the date at the top and let you know in Mavuno before it takes effect.</p>
      </Prose>
    </>
  );
}
