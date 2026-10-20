import { INTERESTS, LANGUAGES, OPEN_TO, type LanguageCode } from "@/lib/catalogue";

export type Interest = (typeof INTERESTS)[number];
export type OpenTo = (typeof OPEN_TO)[number]["value"];

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export const INTEREST_CHOICES = INTERESTS.map((interest) => ({ value: interest, label: capitalise(interest) }));
export const LANGUAGE_CHOICES = LANGUAGES.map((language) => ({ value: language.code, label: language.name }));
export const OPEN_TO_CHOICES = OPEN_TO;

// Stored arrays may hold values the catalogue no longer lists; forms only offer known ones.
export const knownInterests = (values: string[]) => INTERESTS.filter((interest) => values.includes(interest));
export const knownLanguages = (values: string[]): LanguageCode[] => LANGUAGES.filter((language) => values.includes(language.code)).map((language) => language.code);
export const knownOpenTo = (values: string[]) => OPEN_TO.filter((option) => values.includes(option.value)).map((option) => option.value);
