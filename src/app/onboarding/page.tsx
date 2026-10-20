import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ViewerProvider } from "@/components/shell/viewer-context";
import { loadEditableProfile, loadOfficialSpaces, loadStarterSuggestions } from "@/lib/data/settings";
import { loadCities } from "@/lib/data/shell";
import { ageCheckPath, onboardingPath, safeNext } from "@/lib/safe-redirect";
import { requireViewer } from "@/lib/viewer";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const next = safeNext((await searchParams).next);
  const viewer = await requireViewer(onboardingPath(next));
  if (viewer.age.kind === "deactivated") redirect("/deactivated");
  if (viewer.age.kind === "unconfirmed") redirect(ageCheckPath(onboardingPath(next)));
  if (viewer.onboarded) redirect(next);
  const [profile, cities, suggestions, spaces] = await Promise.all([loadEditableProfile({ id: viewer.id }), loadCities(), loadStarterSuggestions(), loadOfficialSpaces(viewer)]);
  if (!profile) throw new Error("Your profile could not be loaded.");

  return (
    <ViewerProvider viewer={viewer}>
      <OnboardingFlow next={next} profile={profile} cities={cities} suggestions={suggestions} spaces={spaces.spaces} joined={spaces.joined} />
    </ViewerProvider>
  );
}
