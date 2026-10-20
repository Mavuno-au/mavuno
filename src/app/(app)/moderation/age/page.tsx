import { AgeReview } from "@/components/moderation/age-review";
import { loadAgeReview } from "@/lib/data/age";

export const metadata = { title: "Age checks" };

export default async function AgeChecksPage() {
  const { deactivated, record } = await loadAgeReview();
  return <AgeReview deactivated={deactivated} record={record} />;
}
