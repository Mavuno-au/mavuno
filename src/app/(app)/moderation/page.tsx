import { ReviewQueue } from "@/components/moderation/review-queue";
import { loadReviewQueue } from "@/lib/data/moderation";

export const metadata = { title: "Review queue" };

export default async function ReviewPage() {
  return <ReviewQueue items={await loadReviewQueue()} />;
}
