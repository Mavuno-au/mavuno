import { Image } from "expo-image";
import { router } from "expo-router";
import { BadgeCheck, Building2, CalendarDays, Globe, Languages, Link2, MapPin, MessageCircle, Sprout } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, View } from "react-native";
import { languageName, OPEN_TO } from "@/lib/catalogue";
import type { ProfileRow } from "@/lib/domain";
import { compact } from "@/lib/format";
import { displayUrl } from "@/lib/text";
import { startConversation } from "@/data/messages";
import type { FollowersYouKnow, Relationship, TeamMember } from "@/data/profiles";
import { useProfileShadow } from "@/data/shadow";
import { FollowButton } from "@/people/follow-button";
import { RichText } from "@/post/rich-text";
import { Avatar, ColourDot } from "@/ui/avatar";
import { Button, Chip } from "@/ui/controls";
import { font, Text } from "@/ui/text";
import { identityColour, usePalette } from "@/ui/theme";
import { openLabelledLink } from "@/util/links";
import { openPhotos } from "@/util/photos";
import { timeZone } from "@/util/time";

// What the website's profile header shows (src/app/(app)/u/[username]/profile-header.tsx),
// laid out as the iPhone design has it.
export function ProfileHeader({
  profile,
  relationship,
  manages = false,
  known = null,
  team = [],
}: {
  profile: ProfileRow;
  relationship: Relationship;
  // The viewer helps run this organisation, so they can edit it.
  manages?: boolean;
  known?: FollowersYouKnow | null;
  team?: TeamMember[];
}) {
  const palette = usePalette();
  const social = useProfileShadow(profile.id, { following: relationship.following, followers: profile.followers_count });
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
    <View>
      <Banner url={profile.banner_url} colour={profile.colour} name={profile.display_name} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
        {/* Only the photo reaches up into the banner; the buttons start below
            it, so however they wrap they never cover it. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <Pressable
            style={{ marginTop: -36 }}
            disabled={!profile.avatar_url}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${profile.display_name}'s photo`}
            accessibilityElementsHidden={!profile.avatar_url}
            onPress={() => (profile.avatar_url ? openPhotos([{ url: profile.avatar_url, alt: "" }], 0) : undefined)}
          >
            <Avatar person={person} size={relationship.self ? 64 : 76} ring />
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 1, paddingTop: 12 }}>
            {relationship.self ? (
              <>
                <Button label="Edit profile" variant="outline" size="medium" onPress={() => router.push({ pathname: "/edit-profile", params: { id: profile.id } })} />
                <Button label="Invite friends" size="medium" onPress={() => router.push("/invite")} />
              </>
            ) : (
              <>
                {manages ? <Button label="Edit profile" variant="outline" size="medium" onPress={() => router.push({ pathname: "/edit-profile", params: { id: profile.id } })} /> : null}
                {relationship.canMessage ? <MessageButton profileId={profile.id} /> : null}
                <FollowButton profileId={profile.id} name={profile.display_name} following={social.following} followsYou={relationship.followsYou} />
              </>
            )}
          </View>
        </View>
        {chips.length > 0 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{chips}</View> : null}

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
              <Text variant="callout" tone="primary" accessibilityRole="link" onPress={() => router.push(`/space/${profile.city?.slug ?? ""}`)}>
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

        {team.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text variant="subhead" tone="muted">
              Team
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {team
                .filter((member) => !member.invited)
                .map((member) => (
                  <Pressable
                    key={member.id}
                    accessibilityRole="link"
                    accessibilityLabel={`${member.displayName}, ${member.role}`}
                    onPress={() => router.push(`/profile/${member.username}`)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingLeft: 4, paddingRight: 10, borderRadius: 18, backgroundColor: palette.wash }}
                  >
                    <Avatar person={member} size={28} />
                    <Text variant="subhead">{member.displayName.split(/\s+/)[0]}</Text>
                  </Pressable>
                ))}
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 4 }}>
          <Count value={profile.posts_count} label={profile.posts_count === 1 ? "post" : "posts"} />
          <Count value={profile.following_count} label="following" onPress={() => router.push({ pathname: "/connections/[username]", params: { username: profile.username, direction: "following" } })} />
          <Count value={social.followers} label={social.followers === 1 ? "follower" : "followers"} onPress={() => router.push({ pathname: "/connections/[username]", params: { username: profile.username, direction: "followers" } })} />
        </View>
        {known ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/connections/[username]", params: { username: profile.username, direction: "followers" } })} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flexDirection: "row" }}>
              {known.people.map((friend, index) => (
                <View key={friend.id} style={{ marginLeft: index === 0 ? 0 : -8, borderRadius: 14, borderWidth: 2, borderColor: palette.surface }}>
                  <Avatar person={friend} size={24} />
                </View>
              ))}
            </View>
            <Text variant="subhead" tone="muted" style={{ flex: 1 }}>
              Followed by {followedBy(known)}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// The member's banner, or a wash of their colour when they haven't added one,
// as on the website. Tapping it opens it full screen, as on Bluesky.
function Banner({ url, colour, name }: { url: string | null; colour: ProfileRow["colour"]; name: string }) {
  const palette = usePalette();
  const fill = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as const;
  if (!url) {
    return (
      <View style={{ height: 120, backgroundColor: palette.wash }}>
        <View style={[fill, { backgroundColor: identityColour(palette, colour), opacity: 0.22 }]} />
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${name}'s banner`} onPress={() => openPhotos([{ url, alt: "" }], 0)} style={{ height: 120, backgroundColor: palette.wash }}>
      <Image source={url} style={fill} contentFit="cover" transition={150} accessible={false} />
    </Pressable>
  );
}

// "Ama and Kofi", or "Ama, Kofi and 3 others you follow".
function followedBy(known: FollowersYouKnow) {
  const names = known.people.map((friend) => friend.displayName.split(/\s+/)[0] ?? friend.displayName);
  const others = known.total - names.length;
  if (others > 0) return `${names.join(", ")} and ${others} ${others === 1 ? "other" : "others"} you follow`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

// Opens the conversation, starting it if this is the first message.
function MessageButton({ profileId }: { profileId: string }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label="Message"
      variant="outline"
      size="medium"
      busy={busy}
      icon={<MessageCircle size={16} color={palette.ink} />}
      onPress={() => {
        setBusy(true);
        void startConversation(profileId).then((result) => {
          setBusy(false);
          if (!result.ok) return Alert.alert("Couldn't start a conversation", result.error);
          router.push(`/conversation/${result.data.id}`);
        });
      }}
    />
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

// Counts read as 1.2K, as on Bluesky. Followers and following are links whose
// tap area reaches 44 points without making the line taller.
function Count({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  const text = (
    <Text variant="callout">
      <Text variant="callout" style={{ fontFamily: font.monoMedium }}>
        {compact(value)}
      </Text>{" "}
      <Text variant="callout" tone="muted">
        {label}
      </Text>
    </Text>
  );
  if (!onPress) return text;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${value} ${label}`} onPress={onPress} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {text}
    </Pressable>
  );
}
