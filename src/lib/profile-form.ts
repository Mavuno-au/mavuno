import { z } from "zod";
import { INTERESTS, LANGUAGES, LIMITS, OPEN_TO, type LanguageCode } from "@/lib/catalogue";
import { accountTypeSchema, colourSchema } from "@/lib/domain";
import { httpsUrl, passwordSchema, usernameSchema, withoutNul } from "@/lib/schemas";

// The profile and settings forms, as the website's server actions and the app
// check them before writing to `profiles` and `profile_settings`.

export const isLanguage = (value: unknown): value is LanguageCode => LANGUAGES.some((language) => language.code === value);
export const languageSchema = z.custom<LanguageCode>(isLanguage, "Choose a language from the list.");
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be up to ${max} characters.`)
    .transform((value) => value || null);

export const languagesSchema = z.array(languageSchema).min(1, "Choose at least one language.").max(12, "Choose up to 12 languages.");

// Every field is optional so each form sends only what it edits; keys left
// undefined are dropped when the update is serialised.
export const profileSchema = z
  .object({
    displayName: z.string().trim().min(1, "Add your name.").max(60, "Names can be up to 60 characters.").transform(withoutNul),
    username: usernameSchema,
    bio: z.string().trim().max(LIMITS.bio, `Your bio can be up to ${LIMITS.bio} characters.`).transform(withoutNul),
    cityId: z.number().int().positive().nullable(),
    heritage: optionalText(60, "Heritage"),
    pronouns: optionalText(30, "Pronouns"),
    interests: z.array(z.enum(INTERESTS)).max(15, "Choose up to 15 interests."),
    languages: languagesSchema,
    website: httpsUrl,
    links: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Give each link a label.").max(40, "Link labels can be up to 40 characters."),
          url: httpsUrl.pipe(z.string("Add the address for each link.")),
        }),
      )
      .max(5, "Add up to 5 links."),
    headline: optionalText(100, "Headline"),
    occupation: optionalText(80, "Occupation"),
    company: optionalText(80, "Company"),
    industry: optionalText(60, "Industry"),
    openTo: z.array(z.enum(OPEN_TO.map((option) => option.value))).max(6),
    category: optionalText(60, "Category"),
    colour: colourSchema.nullable(),
  })
  .partial()
  .transform((c) => ({
    display_name: c.displayName,
    username: c.username,
    bio: c.bio,
    city_id: c.cityId,
    heritage: c.heritage,
    pronouns: c.pronouns,
    interests: c.interests,
    languages: c.languages,
    website: c.website,
    links: c.links,
    headline: c.headline,
    occupation: c.occupation,
    company: c.company,
    industry: c.industry,
    open_to: c.openTo,
    org_category: c.category,
    colour: c.colour,
  }));

export type ProfileChanges = z.input<typeof profileSchema>;

export const privacySchema = z.object({ dmPolicy: z.enum(["everyone", "following", "nobody"]), discoverable: z.boolean(), readReceipts: z.boolean() });

export const languageSettingsSchema = z.object({
  translationLanguage: languageSchema.nullable(),
  feedLanguagesOnly: z.boolean(),
  languages: languagesSchema,
});

export const passwordChangeSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((value) => value.password === value.confirm, "The two passwords don't match.");

// The member's own profile as the edit form reads it, and their private settings.
export const editableRow = z
  .object({
    id: z.uuid(),
    account_type: accountTypeSchema,
    username: z.string(),
    display_name: z.string(),
    bio: z.string(),
    avatar_url: z.string().nullable(),
    banner_url: z.string().nullable(),
    colour: colourSchema.nullable(),
    effective_colour: colourSchema,
    city_id: z.number().nullable(),
    heritage: z.string().nullable(),
    pronouns: z.string().nullable(),
    interests: z.array(z.string()),
    languages: z.array(z.string()),
    website: z.string().nullable(),
    links: z.array(z.object({ label: z.string(), url: z.string() })).catch([]),
    headline: z.string().nullable(),
    occupation: z.string().nullable(),
    company: z.string().nullable(),
    industry: z.string().nullable(),
    open_to: z.array(z.string()),
    org_category: z.string().nullable(),
  })
  .transform((p) => ({
    id: p.id,
    accountType: p.account_type,
    username: p.username,
    displayName: p.display_name,
    bio: p.bio,
    avatarUrl: p.avatar_url,
    bannerUrl: p.banner_url,
    colour: p.colour,
    effectiveColour: p.effective_colour,
    cityId: p.city_id,
    heritage: p.heritage ?? "",
    pronouns: p.pronouns ?? "",
    interests: p.interests,
    languages: p.languages,
    website: p.website ?? "",
    links: p.links,
    headline: p.headline ?? "",
    occupation: p.occupation ?? "",
    company: p.company ?? "",
    industry: p.industry ?? "",
    openTo: p.open_to,
    category: p.org_category ?? "",
  }));

export type EditableProfile = z.infer<typeof editableRow>;

export const EDITABLE =
  "id, account_type, username, display_name, bio, avatar_url, banner_url, colour, effective_colour, city_id, heritage, pronouns, interests, languages, website, links, headline, occupation, company, industry, open_to, org_category";

export const settingsRow = z
  .object({
    dm_policy: z.enum(["everyone", "following", "nobody"]),
    read_receipts: z.boolean(),
    discoverable: z.boolean(),
    translation_language: z.string().nullable(),
    feed_languages_only: z.boolean(),
  })
  .transform((s) => ({
    dmPolicy: s.dm_policy,
    readReceipts: s.read_receipts,
    discoverable: s.discoverable,
    translationLanguage: s.translation_language,
    feedLanguagesOnly: s.feed_languages_only,
  }));

export type PrivateSettings = z.infer<typeof settingsRow>;
export type DmPolicy = PrivateSettings["dmPolicy"];

export const SETTINGS_COLUMNS = "dm_policy, read_receipts, discoverable, translation_language, feed_languages_only";

// A new organisation, as the website's form and the app send it.
export const newOrganisationSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(2, "Add the organisation's name.").max(60, "Names can be up to 60 characters."),
  bio: z.string().trim().max(LIMITS.bio, `The bio can be up to ${LIMITS.bio} characters.`),
  category: z.string().trim().max(60, "The category can be up to 60 characters."),
  cityId: z.union([z.literal(""), z.coerce.number().int().positive()]).transform((value) => (value === "" ? null : value)),
  website: httpsUrl,
});

