import { BadgeCheck, Building2, CalendarDays, Globe, Languages, Link2, MapPin, Sprout } from "lucide-react";
import Link from "next/link";
import { RichText } from "@/components/post/rich-text";
import { ProfileActions } from "@/components/people/profile-actions";
import { Avatar, ColourDot, colourVar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/page";
import { OPEN_TO, languageName } from "@/lib/catalogue";
import type { FollowersYouKnow, Profile } from "@/lib/data/profiles";
import { followedBy } from "@/lib/format";
import { displayUrl } from "@/lib/text";

type TeamMember = { id: string; username: string; displayName: string; avatarUrl: string | null; colour: Profile["colour"]; role: string };

export function ProfileHeader({ profile, team, canManage, known }: { profile: Profile; team: TeamMember[]; canManage: boolean; known: FollowersYouKnow | null }) {
  const person = { displayName: profile.display_name, avatarUrl: profile.avatar_url, colour: profile.colour, accountType: profile.account_type };
  const work = [profile.occupation, profile.company && `at ${profile.company}`].filter(Boolean).join(" ");
  const openTo = OPEN_TO.filter((option) => profile.open_to.includes(option.value));
  const links = [...(profile.website ? [{ label: displayUrl(profile.website), url: profile.website }] : []), ...profile.links];

  return (
    <section className="border-b border-hairline">
      <div
        className="h-32 bg-wash bg-cover bg-center sm:h-40"
        style={profile.banner_url ? { backgroundImage: `url(${JSON.stringify(profile.banner_url)})` } : { backgroundColor: `color-mix(in srgb, ${colourVar(profile.colour)} 22%, var(--wash))` }}
      />
      <div className="px-4 pb-4 sm:px-6">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <Avatar person={person} size="xl" ring className="border-4 border-surface" />
          <ProfileActions profile={{ id: profile.id, username: profile.username, displayName: profile.display_name, relationship: profile.relationship, canManage }} />
        </div>

        <div className="mt-3">
          <h1 className="flex min-w-0 items-center gap-1.5 text-2xl font-semibold tracking-tight">
            <span className="min-w-0 wrap-anywhere">{profile.display_name}</span>
            {profile.org_verified ? <BadgeCheck className="size-5 text-primary" aria-label="Verified organisation" /> : null}
          </h1>
          <p className="flex flex-wrap items-center gap-2 font-mono text-[13px] text-ink-muted">
            <ColourDot colour={profile.colour} />@{profile.username}
            {profile.relationship.followsYou ? <Chip>Follows you</Chip> : null}
            {profile.relationship.muted ? <Chip tone="warning">Muted</Chip> : null}
            {profile.account_type === "organisation" ? <Chip tone="primary">{profile.org_category ?? "Organisation"}</Chip> : null}
          </p>
        </div>

        {profile.headline ? (
          <p dir="auto" className="mt-2 text-[15px] font-medium">
            {profile.headline}
          </p>
        ) : null}
        {profile.bio ? <RichText body={profile.bio} className="mt-2 text-[15px] leading-relaxed" /> : null}

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted [&_svg]:size-4 [&_svg]:shrink-0">
          {profile.city ? (
            <li className="flex items-center gap-1.5">
              <MapPin />
              <Link href={`/spaces/${profile.city.slug}`} className="hover:text-primary">{profile.city.name}, {profile.city.state}</Link>
            </li>
          ) : null}
          {profile.heritage ? (
            <li className="flex items-center gap-1.5">
              <Sprout /> {profile.heritage}
            </li>
          ) : null}
          {profile.pronouns ? <li>{profile.pronouns}</li> : null}
          {work || profile.industry ? (
            <li className="flex items-center gap-1.5">
              <Building2 /> {[work, profile.industry].filter(Boolean).join(" · ")}
            </li>
          ) : null}
          {profile.languages.length > 0 ? (
            <li className="flex items-center gap-1.5">
              <Languages /> {profile.languages.map(languageName).join(", ")}
            </li>
          ) : null}
          {links.map((link) => (
            <li key={link.url} className="flex min-w-0 max-w-full items-center gap-1.5">
              {link.url === profile.website ? <Globe /> : <Link2 />}
              <a href={link.url} target="_blank" rel="noopener noreferrer nofollow ugc me" className="truncate text-primary hover:underline">
                {link.label}
              </a>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <CalendarDays /> Joined {new Date(profile.created_at).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
          </li>
        </ul>

        {openTo.length > 0 ? (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-ink-muted">Open to</span>
            {openTo.map((option) => (
              <Chip key={option.value} tone="primary">{option.label}</Chip>
            ))}
          </p>
        ) : null}

        <p className="mt-3 flex gap-4 text-sm">
          <span>
            <span className="font-mono font-medium tabular">{profile.posts_count}</span> <span className="text-ink-muted">{profile.posts_count === 1 ? "post" : "posts"}</span>
          </span>
          <Link href={`/@${profile.username}/following`} className="hover:underline">
            <span className="font-mono font-medium tabular">{profile.following_count}</span> <span className="text-ink-muted">following</span>
          </Link>
          <Link href={`/@${profile.username}/followers`} className="hover:underline">
            <span className="font-mono font-medium tabular">{profile.followers_count}</span> <span className="text-ink-muted">{profile.followers_count === 1 ? "follower" : "followers"}</span>
          </Link>
        </p>

        {known ? (
          <Link href={`/@${profile.username}/followers`} className="group mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <span className="flex shrink-0 -space-x-1.5">
              {known.people.slice(0, 3).map((person) => (
                <Avatar key={person.id} person={person} size="xs" className="ring-2 ring-surface" />
              ))}
            </span>
            <span className="min-w-0 group-hover:underline">{followedBy(known.people.map((person) => person.displayName), known.total)}</span>
          </Link>
        ) : null}

        {team.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm text-ink-muted">Run by</p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {team.map((member) => (
                <li key={member.id}>
                  <Link href={`/@${member.username}`} className="flex items-center gap-1.5 rounded-full border border-hairline py-0.5 pr-2.5 pl-0.5 text-sm hover:bg-wash">
                    <Avatar person={member} size="xs" />
                    {member.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
