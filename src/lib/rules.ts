import { z } from "zod";
import type { ReportReason } from "@/lib/catalogue";

// What a removal or suspension was made under (public.community_rule). The
// database writes the notice's sentence (public.rule_phrase); these name the
// rule for moderators and link to it.
export const COMMUNITY_RULES = [
  { value: "respect", label: "Rule 1: Respect people", short: "rule 1", href: "/rules#respect" },
  { value: "safety", label: "Rule 2: Keep people safe", short: "rule 2", href: "/rules#safety" },
  { value: "honesty", label: "Rule 3: Be honest", short: "rule 3", href: "/rules#honesty" },
  { value: "opportunities", label: "Rule 4: Fair jobs and opportunities", short: "rule 4", href: "/rules#opportunities" },
  { value: "right_place", label: "Rule 5: Use the right place", short: "rule 5", href: "/rules#right-place" },
  { value: "terms", label: "Terms, section 4: What you mustn't do", short: "section 4 of the terms", href: "/terms#conduct" },
  { value: "law", label: "Required by law (terms, section 6)", short: "section 6 of the terms", href: "/terms#moderation" },
  { value: "age", label: "Terms, section 1: Who can use Mavuno", short: "section 1 of the terms", href: "/terms#who-can-use" },
] as const;

export const ruleSchema = z.enum(COMMUNITY_RULES.map((rule) => rule.value));
export type CommunityRule = z.infer<typeof ruleSchema>;

// Age deactivations have their own action, so moderators don't pick it here.
export const breakableRuleSchema = ruleSchema.exclude(["age"]);
export type BreakableRule = z.infer<typeof breakableRuleSchema>;
export const BREAKABLE_RULES = COMMUNITY_RULES.filter((rule) => rule.value !== "age");

export const ruleOf = (value: CommunityRule) => COMMUNITY_RULES.find((rule) => rule.value === value) ?? COMMUNITY_RULES[0];

// The rule a report reason usually falls under, as a starting choice.
export const RULE_FOR_REASON: Record<ReportReason, BreakableRule | null> = {
  spam: "honesty",
  scam: "honesty",
  harassment: "respect",
  hate: "respect",
  misinformation: "honesty",
  sexual_content: "safety",
  intimate_images: "safety",
  violence: "respect",
  private_information: "safety",
  impersonation: "honesty",
  under_16: null,
  legal: "law",
  other: null,
};

// How long a suspension lasts, as public.moderate_suspend takes it. A second
// suspension adds to the first.
export const SUSPENSION_LENGTHS = [
  { value: "1 hour", label: "1 hour" },
  { value: "1 day", label: "1 day" },
  { value: "3 days", label: "3 days" },
  { value: "7 days", label: "7 days" },
  { value: "30 days", label: "30 days" },
] as const;

export const suspensionLengthSchema = z.enum(SUSPENSION_LENGTHS.map((length) => length.value));
export type SuspensionLength = z.infer<typeof suspensionLengthSchema>;

// Terms section 6 and the community rules: appeals by email within 30 days.
export const APPEAL_DAYS = 30;
export const appealDeadline = (createdAt: string) => new Date(new Date(createdAt).getTime() + APPEAL_DAYS * 86_400_000).toISOString();
export const appealIsOpen = (createdAt: string, now = Date.now()) => Date.parse(appealDeadline(createdAt)) > now;
