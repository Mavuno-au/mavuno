import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { Note, Prose } from "@/components/ui/prose";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR } from "@/lib/site";

export const metadata: Metadata = { title: "Terms", description: "The agreement between you and Mavuno: who can join, what you can post, how we moderate, and your rights." };

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Terms of use" meta={`Last updated ${LEGAL_UPDATED}`} />
      <Prose>
        <p>
          These terms are the agreement between you and {OPERATOR}, which runs Mavuno. By creating an account or using Mavuno, you agree to them. They work together with the{" "}
          <Link href="/rules">community rules</Link> and the <Link href="/privacy">privacy policy</Link>.
        </p>
        <Note>
          <strong>Why we have terms:</strong> they set out, in plain language, what you can expect from us and what we expect from everyone, so that decisions about accounts and content are fair and
          predictable rather than made up case by case.
        </Note>

        <h2 id="who-can-use">1. Who can use Mavuno</h2>
        <ul>
          <li>
            You must be <strong>16 or older</strong>. Australian law requires social media services to take reasonable steps to stop people under 16 having accounts. We may ask you to confirm your age,
            and we'll deactivate accounts we believe belong to someone younger. If that happens to you by mistake, email {mail} and we'll review it.
          </li>
          <li>You can't use Mavuno if we've permanently banned you, or if the law doesn't allow you to.</li>
        </ul>

        <h2>2. Your account</h2>
        <ul>
          <li>Give accurate details when you join, and keep your password to yourself. You're responsible for what happens on your account.</li>
          <li>One account per person. You can use a name that isn't your legal name, but you can't pretend to be someone else.</li>
          <li>Only run an organisation's account if you're allowed to speak for that organisation. Its owners decide who is on its team.</li>
          <li>Tell us straight away at {mail} if you think someone else has access to your account.</li>
        </ul>

        <h2>3. What you post</h2>
        <ul>
          <li>
            <strong>You own what you post.</strong> To run Mavuno, you give us a free, worldwide permission to store, show, copy and adapt it, for example to resize your photos, show your posts in feeds and
            search, show previews when someone shares a link to them, and translate them when someone asks. That permission ends when you delete the content, except for copies in backups until they
            expire.
          </li>
          <li>Only post what you have the right to post. Don't post other people's photos, writing or music without permission.</li>
          <li>Public posts can be seen by anyone, including people who aren't signed in and search engines. Others can reply to and quote them.</li>
          <li>You're responsible for what you post, and for making sure it follows these terms, the community rules and the law.</li>
        </ul>

        <h2 id="conduct">4. What you mustn't do</h2>
        <ul>
          <li>Break the <Link href="/rules">community rules</Link> or the law.</li>
          <li>Scrape or copy members' information, or use bots or automation, without our written permission.</li>
          <li>Try to get into accounts or parts of Mavuno you're not allowed into, or interfere with how it works. If you find a security problem, please tell us privately at {mail}.</li>
          <li>Use Mavuno to send spam or run scams, or to collect people's personal information.</li>
        </ul>

        <h2>5. Opportunities, events and fundraisers</h2>
        <p>
          Jobs, scholarships, events, fundraisers and other listings are posted by members and organisations, not by us. Moderators check new members' first listings, but we can't check every detail of
          every one. Make your own enquiries before you apply, pay, travel or meet anyone, and <strong>never pay to apply</strong> for anything. Report anything that looks wrong.
        </p>

        <h2 id="moderation">6. How we moderate</h2>
        <ul>
          <li>We may hide or remove content, or limit, suspend or close accounts, that break these terms or the community rules, or that we must remove by law.</li>
          <li>We act in proportion to what happened. We'll tell you what we did and why, unless the law, or someone's safety, prevents us.</li>
          <li>You can ask for a decision to be looked at again by emailing {mail} within 30 days. A different moderator will review it.</li>
        </ul>

        <h2 id="complaints">7. Complaints about content, including defamation</h2>
        <p>
          To complain about something on Mavuno, such as content you believe is defamatory, infringes your copyright or breaks the law, report it from its menu or email {mail}. Include a link to it,
          explain the problem and tell us how to contact you. We'll look at it and, where appropriate, act within 7 days. We may tell the person who posted it about the complaint.
        </p>

        <h2>8. Ending your account</h2>
        <ul>
          <li>You can delete your account at any time from <Link href="/settings/account">Settings → Account</Link>. Download your data first if you want to keep it.</li>
          <li>We may suspend or close your account for serious or repeated breaches of these terms, after telling you why, or straight away where we need to protect people.</li>
          <li>If we ever decide to close Mavuno, we'll give you at least 30 days' notice so you can download your data.</li>
        </ul>

        <h2>9. Mavuno is free, and we do our best</h2>
        <ul>
          <li>Mavuno is free to use. We work to keep it available, secure and safe, but we can't promise it will never be interrupted or have mistakes.</li>
          <li>Content on Mavuno is posted by members and doesn't represent our views. We aren't responsible for what members post, or for agreements you make with other members.</li>
          <li>
            Nothing in these terms limits any rights you have under the Australian Consumer Law that can't be excluded. Apart from those rights, and to the extent the law allows, we aren't liable for
            indirect losses, or for losses caused by other members.
          </li>
        </ul>

        <h2>10. Changes to these terms</h2>
        <p>
          If we change these terms in a way that matters, we'll tell you in Mavuno at least 14 days before the change takes effect. If you don't agree, you can delete your account before then. Small
          changes, such as fixing wording, take effect when we post them.
        </p>

        <h2>11. The law that applies</h2>
        <p>
          These terms are governed by the law of Queensland, Australia. You and we can bring a dispute in the courts of Queensland or any other Australian court that can hear it. If you have a problem,
          please email us first. Most things can be sorted out quickly.
        </p>

        <h2>12. Contact</h2>
        <p>
          {OPERATOR}, Queensland, Australia. Email {mail}.
        </p>
      </Prose>
    </>
  );
}
