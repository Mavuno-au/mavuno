import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Feed } from "@/components/post/feed";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { loadFeed } from "@/lib/data/posts";
import { feedSourceSchema } from "@/lib/feeds";

export async function generateMetadata({ params }: PageProps<"/topics/[topic]">): Promise<Metadata> {
  return { title: `#${(await params).topic}` };
}

export default async function TopicPage({ params }: PageProps<"/topics/[topic]">) {
  const parsed = feedSourceSchema.safeParse({ kind: "topic", topic: (await params).topic.toLowerCase() });
  if (!parsed.success || parsed.data.kind !== "topic") notFound();
  const source = parsed.data;
  const page = await loadFeed(source);
  return (
    <>
      <PageHeader title={`#${source.topic}`} back="/discover" />
      <Feed source={source} initial={page.posts} next={page.next} empty={<EmptyState title={`No posts about #${source.topic} yet`}>Use #{source.topic} in a post to start the conversation.</EmptyState>} />
    </>
  );
}
