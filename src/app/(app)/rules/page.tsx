import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { Note, Prose } from "@/components/ui/prose";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

export const metadata: Metadata = { title: "Community rules", description: "How we look after each other on Mavuno, what isn't allowed, and what happens when someone breaks the rules." };

export default function RulesPage() {
  return (
    <>
      <PageHeader title="Community rules" meta={`Last updated ${LEGAL_UPDATED}`} />
      <Prose>
        <p>
          Mavuno is a space for African Australians and the people and organisations around us. These rules apply everywhere on Mavuno: posts, replies, messages, profiles, spaces, events and
          opportunities.
        </p>
        <Note>
          <strong>Why they matter.</strong> People come here to find work, housing, help with study and visas, and each other. That makes our communities a target for scammers and for people who want to
          divide us. The rules exist so that someone new to Australia can trust what they read here, and so everyone can speak without being abused for who they are.
        </Note>

        <h2 id="respect">1. Respect people</h2>
        <ul>
          <li>Disagree as hard as you like about ideas, politics and faith. Don't attack the person.</li>
          <li>No harassment, bullying, threats, intimidation or pile-ons, including sending many people to someone's profile or messages.</li>
          <li>
            No hate or vilification because of race, colour, ethnicity, nationality, tribe or clan, religion, sex, gender identity, sexuality, disability, age or migration status. This includes slurs and
            "jokes" between groups within our own communities, and content about Aboriginal and Torres Strait Islander peoples.
          </li>
          <li>No content that celebrates, threatens or incites violence, and no support for terrorist or violent extremist groups.</li>
        </ul>
        <p>
          <em>Why:</em> racial vilification is unlawful under the Racial Discrimination Act, and publicly threatening or inciting violence or hatred is a crime in several states. Beyond the law, it drives
          people away from the one place that was meant to be theirs.
        </p>

        <h2 id="safety">2. Keep people safe</h2>
        <ul>
          <li>
            <strong>Don't share private information</strong> about anyone without their consent: home address, phone number, workplace, visa or immigration status, or photos of them or their children.
            Publishing someone's personal details to harm or intimidate them (doxxing) is a criminal offence in Australia.
          </li>
          <li>
            <strong>Never share intimate images</strong> of anyone without consent, or threaten to. You can report this straight to eSafety as well as to us.
          </li>
          <li>
            <strong>No sexual content</strong>, and nothing sexual involving anyone under 18, ever. We remove it, ban the account and report it to the police.
          </li>
          <li>No content that encourages self-harm, suicide or eating disorders, and no graphic violence or gore.</li>
          <li>Don't sell or promote weapons, drugs, gambling or anything illegal.</li>
        </ul>

        <h2 id="honesty">3. Be honest</h2>
        <ul>
          <li>
            <strong>No scams.</strong> Nobody may ask people to pay to apply for a job, scholarship, grant, visa or rental, or promise "guaranteed" income, investments or visas. Job and visa scams aimed at
            migrants and international students are among the most common scams reported in Australia.
          </li>
          <li>
            <strong>Visa and immigration help must come from a registered migration agent or an Australian lawyer.</strong> If you offer it, show your MARN or practising certificate. In Australia it's a
            crime to give immigration assistance for a fee without being registered.
          </li>
          <li>Don't pretend to be another person or organisation. Parody is fine if it's clearly labelled. Organisations can ask a moderator to be verified.</li>
          <li>No spam, fake accounts, bought followers, or coordinated activity to make something look more popular than it is.</li>
          <li>Don't share health, immigration or legal claims you know to be false. When it matters, link to the official source.</li>
          <li>Fundraising, for a funeral, medical bills, flights home or a community project, must be genuine and say who receives the money. Mavuno doesn't check fundraisers, so give only to people you trust.</li>
        </ul>

        <h2 id="opportunities">4. Fair jobs and opportunities</h2>
        <ul>
          <li>Jobs must pay at least the legal minimum and say whether they're paid. Unpaid work is only lawful as a short skills trial or genuine placement, never as a disguised job.</li>
          <li>Don't advertise sham contracting: calling an employee a contractor to avoid paying wages, super or tax.</li>
          <li>Never ask applicants for money, bank details, passport copies or tax file numbers before a genuine offer.</li>
          <li>Visa holders have the same workplace rights as everyone else. Don't post jobs that exploit people because of their visa.</li>
        </ul>

        <h2 id="right-place">5. Use the right place</h2>
        <ul>
          <li>
            Post jobs, scholarships, grants and mentoring under <Link href="/opportunities">Opportunities</Link> and gatherings under <Link href="/events">Events</Link>, so people can find them.
          </li>
          <li>Keep posts in a space on that space's topic. Space owners can ask moderators to remove what's off topic.</li>
          <li>Organisation accounts post for the organisation. Only run one if you're allowed to speak for it.</li>
        </ul>

        <h2>How moderation works</h2>
        <ul>
          <li>
            <strong>Posts go up straight away.</strong> We don't check posts before they're public. Moderation starts with your reports, so please use them.
          </li>
          <li>
            <strong>Reports:</strong> report anything from its menu. The person you report is never told who reported them. When three people report the same thing, it's hidden until a moderator looks at
            it.
          </li>
          <li>
            <strong>After a report:</strong> if your account has been reported in the past week and the report wasn't dismissed, your new posts, events and opportunities are checked by a moderator before they
            go public.
          </li>
          <li>
            <strong>Waves of spam:</strong> if we see one, we may check new members' posts for a while before they go public.
          </li>
          <li>
            <strong>Mute and block:</strong> you can mute or block anyone yourself. They aren't told. A block also stops them seeing your posts or messaging you, including through an organisation they run.
          </li>
        </ul>

        <h3>What happens when a rule is broken</h3>
        <p>
          Mavuno has zero tolerance for objectionable content and abusive members. We act on every report within 24 hours. We act in proportion to the harm, and we always tell you what we did
          and which rule it was under:
        </p>
        <ul>
          <li>For most first problems, we remove the content and send you a notice explaining why.</li>
          <li>For repeated breaks, we suspend the account for a set time.</li>
          <li>For the most serious harm, such as child sexual abuse material, credible threats, doxxing, or scams that take people's money, we remove it at once, ban the account and may report it to the police.</li>
        </ul>

        <h3 id="appeals">If you think we got it wrong</h3>
        <p>
          Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 30 days with a link to the notice and why you think it was a mistake. A different moderator will look again, and we aim to
          reply within 7 days. If we got it wrong, we restore what we removed.
        </p>

        <h2>Getting help beyond Mavuno</h2>
        <ul>
          <li>
            <strong>Emergency or danger:</strong> call 000. Police assistance line: 131 444.
          </li>
          <li>
            <strong>Feeling unsafe or overwhelmed:</strong> Lifeline 13 11 14, Beyond Blue 1300 22 4636. Family and domestic violence: 1800RESPECT (1800 737 732).
          </li>
          <li>
            <strong>Serious online abuse:</strong> if you've reported abuse to us and it hasn't been dealt with within 48 hours, report it to{" "}
            <a href="https://www.esafety.gov.au/report" target="_blank" rel="noopener noreferrer">eSafety</a>. For intimate images shared without consent, go to eSafety straight away.
          </li>
          <li>
            <strong>Racial vilification:</strong> you can make a free complaint, in any language, to the{" "}
            <a href="https://humanrights.gov.au/complaints" target="_blank" rel="noopener noreferrer">Australian Human Rights Commission</a>.
          </li>
          <li>
            <strong>Scams:</strong> report them to <a href="https://www.scamwatch.gov.au/report-a-scam" target="_blank" rel="noopener noreferrer">Scamwatch</a>. If you've sent money, call your bank
            straight away.
          </li>
          <li>
            <strong>Unregistered visa help:</strong> check an agent on the <a href="https://www.mara.gov.au" target="_blank" rel="noopener noreferrer">OMARA register</a>, and report unlawful advice to
            Border Watch.
          </li>
          <li>
            <strong>Pay and conditions:</strong> the <a href="https://www.fairwork.gov.au" target="_blank" rel="noopener noreferrer">Fair Work Ombudsman</a>, 13 13 94.
          </li>
        </ul>
      </Prose>
    </>
  );
}
