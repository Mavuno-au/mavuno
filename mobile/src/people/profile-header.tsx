import { BadgeCheck, Building2, CalendarDays, Globe, Languages, Link2, MapPin, Sprout } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { languageName, OPEN_TO } from "@/lib/catalogue";
import type { ProfileRow } from "@/lib/domain";
import { displayUrl } from "@/lib/text";
import { siteLink } from "@/data/env";
import type { Relationship } from "@/data/profiles";
import { RichText } from "@/post/rich-text";
import { Avatar, ColourDot } from "@/ui/avatar";
import { Chip } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { usePalette } from "@/ui/theme";
import { openLabelledLink, openLink } from "@/util/links";
import { timeZone } from "@/util/time";

// What the website's profile header shows (src/app/(app)/u/[username]/profile-header.tsx),
// laid out as the iPhone design has it.
export function ProfileHeader({ profile, relationship }: { profile: ProfileRow; relationship: Relationship }) {
  const palette = usePalette();
  const person = { displayName: profile.display_name, avatarUrl: profile.avatar_url, colour: profile.colour, accountType: profile.account_type };
  const work = [profile.occupation, profile.company && `at ${profile.company}`].filter(Boolean).join(" ");
  const openTo = OPEN_TO.filter((option) => profile.open_to.includes(option.value));
  const links = [...(profile.website ? [{ label: displayUrl(profile.website), url: profile.website }] : []), ...profile.links];
  const icon = (Icon: typeof MapPin) => <Icon size={16} color={palette.inkMuted} />;
  const chips = [
    relationship.followsYou ? <Chip key="follows">Follows you</Chip> : null,
    relationship.invite === "invited_you" ? <Chip key="invited">Invited you</Chip> : null,
    relationship.invite === "you_invited" ? <Chip key="invite">Joined from your invite</Chip> : null,
    relationship.muted ? (
      <Chip key="muted" tone="warning">
        Muted
      </Chip>
    ) : null,
    profile.account_type === "organisation" ? (
      <Chip key="org" tone="primary">
        {profile.org_category ?? "Organisation"}
      </Chip>
    ) : null,
  ].filter(Boolean);

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <Avatar person={person} size={relationship.self ? 64 : 76} ring />
        {chips.length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, flexShrink: 1 }}>{chips}</View> : null}
      </View>

      <View style={{ gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text variant="title" accessibilityRole="header" style={{ flexShrink: 1 }}>
            {profile.display_name}
          </Text>
          {profile.org_verified ? (
            <View accessible accessibilityLabel="Verified organisation">
              <BadgeCheck size={22} color={palette.primary} />
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ColourDot colour={profile.colour} size={7} />
          <Text variant="meta" tone="muted" style={{ fontSize: 15, lineHeight: 20 }}>
            @{profile.username}
          </Text>
        </View>
      </View>

      {profile.headline ? (
        <Text variant="callout" style={{ fontFamily: font.medium, writingDirection: "auto" }}>
          {profile.headline}
        </Text>
      ) : null}
      {profile.bio ? <RichText body={profile.bio} /> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 }}>
        {profile.city ? (
          <Fact icon={icon(MapPin)}>
            <Text variant="callout" tone="primary" accessibilityRole="link" onPress={() => openLink(siteLink(`/spaces/${profile.city?.slug ?? ""}`))}>
              {profile.city.name}, {profile.city.state}
            </Text>
          </Fact>
        ) : null}
        {profile.heritage ? <Fact icon={icon(Sprout)}>{profile.heritage}</Fact> : null}
        {profile.pronouns ? <Fact>{profile.pronouns}</Fact> : null}
        {work || profile.industry ? <Fact icon={icon(Building2)}>{[work, profile.industry].filter(Boolean).join(" · ")}</Fact> : null}
        {profile.languages.length > 0 ? <Fact icon={icon(Languages)}>{profile.languages.map(languageName).join(", ")}</Fact> : null}
        {links.map((link) => (
          <Fact key={link.url} icon={icon(link.url === profile.website ? Globe : Link2)}>
            <Text variant="callout" tone="primary" accessibilityRole="link" numberOfLines={1} onPress={() => openLabelledLink(link.url, link.label)}>
              {link.label}
            </Text>
          </Fact>
        ))}
        <Fact icon={icon(CalendarDays)}>{`Joined ${new Date(profile.created_at).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone })}`}</Fact>
      </View>

      {openTo.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Text variant="subhead" tone="muted">
            Open to
          </Text>
          {openTo.map((option) => (
            <Chip key={option.value} tone="primary">
              {option.label}
            </Chip>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 4 }}>
        <Count value={profile.posts_count} label={profile.posts_count === 1 ? "post" : "posts"} />
        <Count value={profile.following_count} label="following" />
        <Count value={profile.followers_count} label={profile.followers_count === 1 ? "follower" : "followers"} />
      </View>
    </View>
  );
}

function Fact({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
      {icon}
      {typeof children === "string" ? (
        <Text variant="callout" tone="muted" style={{ flexShrink: 1 }}>
          {children}
        </Text>
      ) : (
        <View style={{ flexShrink: 1 }}>{children}</View>
      )}
    </View>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <Text variant="callout">
      <Text variant="callout" style={{ fontFamily: font.monoMedium }}>
        {value}
      </Text>{" "}
      <Text variant="callout" tone="muted">
        {label}
      </Text>
    </Text>
  );
}
