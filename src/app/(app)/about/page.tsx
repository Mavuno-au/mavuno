import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { Note, Prose } from "@/components/ui/prose";
import { CONTACT_EMAIL, OPERATOR } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "Mavuno is the social network for African Australians: follow people and organisations, join your city's space, and find events, jobs and scholarships from the community.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About Mavuno" />
      <Prose>
        <p>
          <strong>Mavuno</strong> means harvest in Swahili: what a community grows together. It's the social network for African Australians, and for the organisations, businesses and friends around
          us.
        </p>

        <h2>Why Mavuno exists</h2>
        <p>
          Our communities are spread across every Australian city, and much of what matters to us travels by word of mouth: a WhatsApp forward about a job, a flyer for a community day, a friend who knows a
          good migration agent. Some of it reaches everyone who needs it. Much of it doesn't, and some of it is a scam.
        </p>
        <p>Mavuno puts that in one place, built around how we actually live here:</p>
        <ul>
          <li>
            <strong>Find your people, city by city.</strong> Every city has its own space, and Nearby shows members and events close to you without ever using your location.
          </li>
          <li>
            <strong>Opportunities that reach us.</strong> Jobs, scholarships, grants and mentoring, posted by members and organisations who want to hire and support people from our communities.
          </li>
          <li>
            <strong>Events in one calendar.</strong> Cultural nights, networking, church and mosque events, sport and family days, from Darwin to Hobart.
          </li>
          <li>
            <strong>Organisations with a home.</strong> Associations, community groups and businesses get their own accounts, run by their team.
          </li>
          <li>
            <strong>In our languages.</strong> Post in English, Swahili, Amharic, Somali, Arabic, French, Dinka and more, and translate what others write.
          </li>
        </ul>

        <h2>What you can do</h2>
        <ul>
          <li>Post text, photos, links, videos and polls; reply, quote and save posts; schedule a post for later.</li>
          <li>Follow people and organisations. Your Following feed shows them newest first, with nothing paid or promoted mixed in.</li>
          <li>Join spaces for your city and for careers, business, faith, food, families, study and more.</li>
          <li>Message people one to one or in groups. People you don't follow land in Requests until you accept them.</li>
          <li>RSVP to events and save opportunities to come back to.</li>
        </ul>

        <h2>What we promise</h2>
        <ul>
          <li>
            <strong>No ads, and we never sell your data.</strong> Mavuno is free to use.
          </li>
          <li>
            <strong>As little about you as we can.</strong> We store the city you choose, never where you are. Photos are cleaned of location data before they're stored.
          </li>
          <li>
            <strong>A safe place to speak.</strong> Posts go up straight away, every report goes to a real moderator, and mutes and blocks apply everywhere.
          </li>
          <li>
            <strong>Your data is yours.</strong> Download everything we hold about you, or delete your account, at any time from Settings.
          </li>
        </ul>

        <h2>Why the rules matter</h2>
        <p>
          A community network is only useful if people trust it. Scams aimed at migrants and international students, fake job and visa offers, and racist abuse are real problems on the big platforms. Our{" "}
          <Link href="/rules">community rules</Link> are written for those risks specifically, and our <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link> say plainly what we do
          with your information and what we expect of everyone here.
        </p>

        <h2>Who runs Mavuno</h2>
        <p>
          Mavuno is run by {OPERATOR}, based in Queensland. You need to be 16 or older to join. Questions, ideas or a partnership in mind? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <Note>
          Writing about Mavuno or making a poster for your event? The <Link href="/brand">brand page</Link> has the logo, colours and type.
        </Note>
      </Prose>
    </>
  );
}
