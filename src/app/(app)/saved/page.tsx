import type { Metadata } from "next";
import { Feed } from "@/components/post/feed";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { loadFeed } from "@/lib/data/posts";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  await requireViewer("/saved");
  const page = await loadFeed({ kind: "saved" });
  return (
    <>
      <PageHeader title="Saved" meta="Only you can see what you save" />
      <Feed
        source={{ kind: "saved" }}
        initial={page.posts}
        next={page.next}
        dayMarkers={false}
        end="That's everything you've saved."
        empty={<EmptyState title="Nothing saved yet">Tap the bookmark on any post to keep useful discussions, opportunities and recommendations for later.</EmptyState>}
      />
    </>
  );
}
