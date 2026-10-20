import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Feed } from "@/components/post/feed";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { loadFeed } from "@/lib/data/posts";
import { feedSourceSchema } from "@/lib/feeds";

// A topic with only a post or two is a thin page; it's indexed once it has a few.
const INDEXED_FROM = 3;

export async function generateMetadata({ params }: PageProps<"/topics/[topic]">): Promise<Metadata> {
  const topic = (await params).topic.toLowerCase();
  const parsed = feedSourceSchema.safeParse({ kind: "topic", topic });
  const posts = parsed.success ? (await loadFeed(parsed.data)).posts.length : 0;
  return {
    title: `#${topic}`,
    description: `Posts about #${topic} from African Australians on Mavuno.`,
    alternates: { canonical: `/topics/${topic}` },
    robots: posts < INDEXED_FROM ? { index: false, follow: true } : undefined,
  };
}

export default async function TopicPage({ params }: PageProps<"/topics/[topic]">) {
  const parsed = feedSourceSchema.safeParse({ kind: "topic", topic: (await params).topic.toLowerCase() });
  if (!parsed.success || parsed.data.kind !== "topic") notFound();
  const source = parsed.data;
  const page = await loadFeed(source);
  return (
    <>
      <PageHeader title={`#${source.topic}`} back="/discover" />
      <Feed source={source} initial={page.posts} previews={page.previews} next={page.next} empty={<EmptyState title={`No posts about #${source.topic} yet`}>Use #{source.topic} in a post to start the conversation.</EmptyState>} />
    </>
  );
}
