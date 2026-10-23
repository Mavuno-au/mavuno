import { router } from "expo-router";
import { Briefcase } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { OPPORTUNITY_TYPES } from "@/lib/catalogue";
import { DEADLINE_ZONE, opportunityPlace, type Opportunity } from "@/lib/community";
import { Avatar } from "@/ui/avatar";
import { Chip } from "@/ui/controls";
import { Text } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";

export const applyBy = (deadline: string) => `Apply by ${new Date(deadline).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: DEADLINE_ZONE })}`;

// The website's rows: who, where, type, apply-by date and pay.
export function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
  const palette = usePalette();
  const where = opportunityPlace(opportunity);
  const who = opportunity.organisation ?? opportunity.poster.displayName;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${OPPORTUNITY_TYPES[opportunity.type].label}: ${opportunity.title}, ${who}${where ? `, ${where}` : ""}`}
      onPress={() => router.push(`/opportunity/${opportunity.id}`)}
      style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: HAIRLINE, borderBottomColor: palette.hairline, backgroundColor: pressed ? palette.wash : "transparent" })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" }}>
        {opportunity.poster.avatarUrl ? <Avatar person={opportunity.poster} size={44} /> : <Briefcase size={20} color={palette.primary} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="name" numberOfLines={2}>
          {opportunity.title}
        </Text>
        <Text variant="subhead" tone="muted" numberOfLines={1}>
          {[who, where].filter(Boolean).join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          <Chip tone="primary">{OPPORTUNITY_TYPES[opportunity.type].label}</Chip>
          {opportunity.closed ? <Chip>Closed</Chip> : opportunity.deadlineAt ? <Chip>{applyBy(opportunity.deadlineAt)}</Chip> : null}
          {opportunity.compensation ? <Chip>{opportunity.compensation}</Chip> : null}
        </View>
      </View>
    </Pressable>
  );
}
