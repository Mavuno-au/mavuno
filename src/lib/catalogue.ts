import type { OpportunityType } from "@/lib/domain";

export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "ti", name: "Tigrinya", native: "ትግርኛ" },
  { code: "om", name: "Oromo", native: "Afaan Oromoo" },
  { code: "so", name: "Somali", native: "Soomaali" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "fr", name: "French", native: "Français" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "ig", name: "Igbo", native: "Asụsụ Igbo" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "ak", name: "Akan (Twi)", native: "Akan" },
  { code: "ee", name: "Ewe", native: "Eʋegbe" },
  { code: "wo", name: "Wolof", native: "Wolof" },
  { code: "ln", name: "Lingala", native: "Lingála" },
  { code: "rw", name: "Kinyarwanda", native: "Ikinyarwanda" },
  { code: "rn", name: "Kirundi", native: "Ikirundi" },
  { code: "lg", name: "Luganda", native: "Luganda" },
  { code: "sn", name: "Shona", native: "chiShona" },
  { code: "nd", name: "Ndebele", native: "isiNdebele" },
  { code: "zu", name: "Zulu", native: "isiZulu" },
  { code: "xh", name: "Xhosa", native: "isiXhosa" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "din", name: "Dinka", native: "Thuɔŋjäŋ" },
  { code: "nus", name: "Nuer", native: "Thok Naath" },
  { code: "mg", name: "Malagasy", native: "Malagasy" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export function languageName(code: string) {
  return LANGUAGES.find((language) => language.code === code)?.name ?? code;
}

export const INTERESTS = [
  "careers", "business", "tech", "education", "health", "faith", "food", "music", "arts", "fashion",
  "football", "basketball", "running", "parenting", "housing", "politics", "volunteering", "film",
  "writing", "photography", "science", "law", "finance", "property", "travel", "languages", "youth",
] as const;

export const OPEN_TO = [
  { value: "mentoring", label: "Mentoring others" },
  { value: "being_mentored", label: "Finding a mentor" },
  { value: "work", label: "New work" },
  { value: "hiring", label: "Hiring" },
  { value: "collaboration", label: "Collaborations" },
  { value: "volunteering", label: "Volunteering" },
] as const;

export const OPPORTUNITY_TYPES: Record<OpportunityType, { label: string; plural: string }> = {
  job: { label: "Job", plural: "Jobs" },
  internship: { label: "Internship", plural: "Internships" },
  scholarship: { label: "Scholarship", plural: "Scholarships" },
  grant: { label: "Grant", plural: "Grants" },
  mentoring: { label: "Mentoring", plural: "Mentoring" },
  business: { label: "Business", plural: "Business" },
  volunteering: { label: "Volunteering", plural: "Volunteering" },
};

export const EVENT_CATEGORIES = {
  community: "Community",
  networking: "Networking",
  cultural: "Cultural",
  faith: "Faith",
  sport: "Sport",
  workshop: "Workshop",
  family: "Family",
  music: "Music",
  food: "Food",
  other: "Other",
} as const;

export type EventCategory = keyof typeof EVENT_CATEGORIES;

export const EVENT_FORMATS = { in_person: "In person", online: "Online", hybrid: "In person and online" } as const;

export const AU_TIMEZONES = [
  { value: "Australia/Brisbane", label: "Brisbane (AEST)" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne, Canberra, Hobart" },
  { value: "Australia/Adelaide", label: "Adelaide" },
  { value: "Australia/Darwin", label: "Darwin" },
  { value: "Australia/Perth", label: "Perth" },
] as const;

export const REPORT_REASONS = [
  { value: "spam", label: "Spam or misleading links" },
  { value: "scam", label: "A scam or fraud" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate or discrimination" },
  { value: "misinformation", label: "False or misleading information" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "intimate_images", label: "Intimate images shared without consent" },
  { value: "violence", label: "Violence or threats" },
  { value: "private_information", label: "Someone's private information" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "under_16", label: "Someone under 16" },
  { value: "legal", label: "Defamation or legal complaint" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const isReportReason = (value: unknown): value is ReportReason => REPORT_REASONS.some((reason) => reason.value === value);

export const reportReasonLabel = (value: string) => REPORT_REASONS.find((reason) => reason.value === value)?.label ?? value;

export const POLL_DURATIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;

export const COLOURS = ["Terracotta", "Ochre", "Plum", "Teal", "Rose", "Indigo"] as const;

export const LIMITS = {
  postBody: 4000,
  messageBody: 2000,
  pollOption: 50,
  imageAlt: 1000,
  images: 4,
  messageImages: 3,
  reportDetails: 500,
  // As X caps bios. The database still allows 300, so bios written before
  // this stay as they are until their owner edits them.
  bio: 160,
} as const;
