import type { Interest } from "@/lib/choices";

// What onboarding offers, for the website's steps and the app's.

// Official interest spaces are broader than interests, so several interests lead to one space.
export const INTEREST_SPACES: Partial<Record<Interest, string>> = {
  careers: "careers",
  business: "business",
  tech: "tech",
  education: "students",
  health: "health",
  faith: "faith",
  food: "food",
  music: "arts",
  arts: "arts",
  fashion: "arts",
  film: "arts",
  writing: "arts",
  photography: "arts",
  football: "sport",
  basketball: "sport",
  running: "sport",
  parenting: "parents",
  housing: "housing",
  politics: "advocacy",
  volunteering: "advocacy",
  languages: "heritage",
  youth: "youth",
};
