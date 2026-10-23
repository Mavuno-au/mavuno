import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { Note, Prose } from "@/components/ui/prose";
import { CONTACT_EMAIL, OPERATOR, SITE_DESCRIPTION } from "@/lib/site";

export const metadata: Metadata = { title: "About", description: SITE_DESCRIPTION };

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About Mavuno" />
      <Prose>
        <p>
          <strong>Mavuno is the social network for African Australians.</strong> If your family's story runs through Harare, Juba, Lagos, Addis Ababa, Nairobi, Accra or Kinshasa and your life is
          here, it was made for you, whether you landed last month or were born in Toowoomba. Put your heritage on your profile in your own words: Oromo, Nuer, Ghanaian-Australian, or all of the
          above.
        </p>
        <p>Mavuno is Swahili for harvest.</p>

        <h2>What's here</h2>
        <ul>
          <li>
            <strong>A space for your city.</strong> Brisbane, Western Sydney, Melbourne, Perth, Adelaide and more each have one. Ask for a mechanic, a room, a church or a Saturday game, and hear
            from people who live there.
          </li>
          <li>
            <strong>Events.</strong> Dinner dances, independence days, tournaments, church and mosque events, graduations. RSVP, see who's going and add it to your calendar.
          </li>
          <li>
            <strong>Jobs, scholarships and mentoring</strong>, each posted by a named person or organisation you can message before you apply.
          </li>
          <li>
            <strong>Organisations.</strong> Associations, churches, clubs and businesses run their own accounts, with their team.
          </li>
          <li>
            <strong>Messages</strong>, one to one or in groups. People you don't follow wait in Requests until you say yes.
          </li>
          <li>
            <strong>Your languages.</strong> Write in English, Swahili, Amharic, Somali, Arabic, French, Dinka or any other, and translate a post with one tap.
          </li>
        </ul>

        <h2>Why we built it</h2>
        <p>
          So much of what matters to us travels by forward: a job, a flyer, a number for someone who can help. By the fifth forward nobody knows who wrote it, and some of it is a scam. On Mavuno every
          post has a name and a profile behind it, and you can ask the person who wrote it.
        </p>
        <p>
          And our communities deserve a place to talk without the comment-section racism. Here, every report goes to a person on our team, and a block or a mute applies everywhere at once.
        </p>

        <h2>What we promise</h2>
        <ul>
          <li>No ads, and nothing paid mixed into your feed. Following shows the people you follow, newest first.</li>
          <li>We never sell your information. We know the city you choose, never where you are, and photos lose their location before they're stored.</li>
          <li>
            Until a new member has a track record, an automatic check by OpenAI looks at what they publish, so scams and abuse are caught early. Private messages are never checked.
          </li>
          <li>Download everything we hold about you, or delete your account, from Settings, whenever you like.</li>
        </ul>
        <p>
          The <Link href="/rules">community rules</Link> are written for what our communities actually face online: fake jobs, fake visa offers, scams and racist abuse. The{" "}
          <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link> say plainly what we do with your information.
        </p>

        <h2>Who runs it</h2>
        <p>
          Mavuno is run by {OPERATOR} in Queensland, and it's free. You need to be 16 or older to join. Questions, ideas, or want your organisation on here? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <Note>
          Writing about Mavuno or making a flyer for your event? The <Link href="/brand">brand page</Link> has the logo, colours and type.
        </Note>
      </Prose>
    </>
  );
}
