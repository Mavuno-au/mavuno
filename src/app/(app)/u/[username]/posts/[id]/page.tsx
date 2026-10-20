import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";
import { PostItem } from "@/components/post/post-item";
import { ReplyList } from "@/components/post/reply-list";
import { ThreadContinuation } from "@/components/post/thread-continuation";
import { JsonLd } from "@/components/seo/json-ld";
import { PageHeader } from "@/components/ui/page";
import { loadThread } from "@/lib/data/posts";
import type { ThreadPlace } from "@/lib/domain";
import { postJsonLd } from "@/lib/structured-data";

const postId = z.uuid();

export async function generateMetadata({ params }: PageProps<"/u/[username]/posts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const parsed = postId.safeParse(id);
  const thread = parsed.success ? await loadThread(parsed.data) : null;
  if (!thread) return { title: "Post" };
  const { post } = thread;
  const flat = post.body.replace(/\s+/g, " ").trim();
  const excerpt = flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
  const path = `/@${post.author.username}/posts/${post.id}`;
  return {
    title: { absolute: `${post.author.displayName} (@${post.author.username}) on Mavuno: “${excerpt || "Photo"}”` },
    description: flat.slice(0, 200) || undefined,
    alternates: { canonical: path },
    // The share image is drawn by ./opengraph-image.tsx.
    openGraph: { type: "article", url: path, publishedTime: post.createdAt, authors: [`/@${post.author.username}`] },
  };
}

export default async function PostPage({ params }: PageProps<"/u/[username]/posts/[id]">) {
  const { username, id } = await params;
  const parsed = postId.safeParse(id);
  if (!parsed.success) notFound();
  const thread = await loadThread(parsed.data);
  if (!thread) notFound();
  const { post, ancestors, continuation, replies, next } = thread;
  if (post.author.username !== username.toLowerCase()) permanentRedirect(`/@${post.author.username}/posts/${post.id}`);
  const place = continuation.kind === "thread" ? continuation.place : undefined;
  const placeAbove = (steps: number): ThreadPlace | undefined => (place && place.position > steps ? { ...place, position: place.position - steps } : undefined);

  return (
    <>
      {post.status === "published" ? <JsonLd data={postJsonLd(post)} /> : null}
      <PageHeader title={post.parentId ? "Reply" : "Post"} back={`/@${post.author.username}`} />
      {ancestors.map((row, index) => (
        <PostItem key={row.id} row={row} variant="ancestor" place={placeAbove(ancestors.length - index)} />
      ))}
      <PostItem row={post} variant="focus" place={place} />
      {continuation.kind === "thread" ? <ThreadContinuation postId={post.id} place={continuation.place} initial={continuation.parts} /> : null}
      <ReplyList postId={post.id} initial={replies} next={next} />
    </>
  );
}
