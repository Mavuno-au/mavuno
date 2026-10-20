"use client";

import { BadgeCheck, Bookmark, Flag, Heart, Link2, ListTree, MessageCircle, Pin, PinOff, Repeat2, Trash2, UserX, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { deletePost, loadMoreReplies, pinPost, restorePost, setLike, setSaved, unpinPost } from "@/app/actions/posts";
import { setRelation } from "@/app/actions/social";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { ConfirmBlockDialog } from "@/components/people/confirm-block-dialog";
import { EventAttachment, ImageGrid, LinkCard, OpportunityAttachment, QuotedBlock } from "@/components/post/attachments";
import { Composer } from "@/components/post/composer";
import { PollView } from "@/components/post/poll";
import { RichText } from "@/components/post/rich-text";
import { Translation } from "@/components/post/translation";
import { useActsAs, useViewer } from "@/components/shell/viewer-context";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { LocalTime } from "@/components/ui/local-time";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Chip } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import type { Post, PostRow, ThreadPlace } from "@/lib/domain";
import { compact, count } from "@/lib/format";
import type { Result } from "@/lib/result";
import { foldBody } from "@/lib/text";
import { joinPath } from "@/lib/safe-redirect";

export const postPath = (post: Pick<Post, "id" | "author">) => `/@${post.author.username}/posts/${post.id}`;

// The database keeps a deleted post's content for 30 seconds; the toast offers
// Undo for a little less so a late click never fails.
const UNDO_MS = 28_000;
// Replies indent up to this depth; deeper ones line up and say who they answer.
const MAX_INDENT = 3;

type Variant = "feed" | "focus" | "reply" | "ancestor";
type RowState = "shown" | "confirming" | "removed";
// Where a reply is shown: under which post, and how deep.
type Thread = { parentId: string; depth: number };

export function PostItem({
  row,
  variant = "feed",
  thread,
  place,
  pinned = false,
}: {
  row: PostRow;
  variant?: Variant;
  thread?: Thread;
  place?: ThreadPlace;
  pinned?: boolean;
}) {
  const [state, setState] = useState<RowState>("shown");
  if (row.kind === "tombstone") return <TombstoneItem row={row} depth={thread?.depth ?? 0} />;
  if (state === "removed" && variant !== "focus") return null;
  return <LivePost post={row} variant={variant} thread={thread} place={place} pinned={pinned} state={state} setState={setState} />;
}

function TombstoneItem({ row, depth }: { row: Extract<PostRow, { kind: "tombstone" }>; depth: number }) {
  return (
    <article className="border-b border-hairline px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span className="size-10 shrink-0 rounded-full border-2 border-dashed border-rail" />
        <span>
          <span className="font-mono">[deleted]</span> This post was deleted.
        </span>
      </div>
      {row.replies > 0 ? <Replies postId={row.id} total={row.replies} depth={depth} added={[]} /> : null}
    </article>
  );
}

function LivePost({
  post,
  variant,
  thread,
  place,
  pinned,
  state,
  setState,
}: {
  post: Post;
  variant: Variant;
  thread?: Thread;
  place?: ThreadPlace;
  pinned: boolean;
  state: RowState;
  setState: (state: RowState) => void;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const own = useActsAs(post.authorId);
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [saved, setSavedState] = useState(post.saved);
  const [expanded, setExpanded] = useState(variant === "focus");
  const [replying, setReplying] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [dialog, setDialog] = useState<"none" | "report" | "block">("none");
  const [added, setAdded] = useState<PostRow[]>([]);
  const [, startTransition] = useTransition();
  const href = postPath(post);
  const signIn = () => router.push(joinPath(href));
  const depth = thread?.depth ?? 0;
  const quotesParent = thread !== undefined && post.quoteId === thread.parentId;
  const flattened = thread !== undefined && depth > MAX_INDENT;

  if (state === "removed") return <DeletedHere postId={post.id} onRestored={() => setState("shown")} />;

  function toggleLike(event: MouseEvent) {
    event.stopPropagation();
    if (!viewer) return signIn();
    const next = !liked;
    setLiked(next);
    setLikes((value) => value + (next ? 1 : -1));
    startTransition(async () => {
      const result = await setLike(post.id, next);
      if (!result.ok) {
        setLiked(!next);
        setLikes((value) => value + (next ? -1 : 1));
        toast.error(result.error);
      }
    });
  }

  function toggleSave(event: MouseEvent) {
    event.stopPropagation();
    if (!viewer) return signIn();
    const next = !saved;
    setSavedState(next);
    startTransition(async () => {
      const result = await setSaved(post.id, next);
      if (!result.ok) {
        setSavedState(!next);
        toast.error(result.error);
      } else if (next) toast("Saved", { action: { label: "View saved", onClick: () => router.push("/saved") } });
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      toast("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setState("removed");
      if (variant === "focus") return;
      toast("Post deleted", {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: async () => {
            const restored = await restorePost(post.id);
            if (!restored.ok) {
              toast.error(restored.error);
              return;
            }
            setState("shown");
          },
        },
      });
    });
  }

  function run(action: () => Promise<Result>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast(success);
      router.refresh();
    });
  }

  const menu: MenuItem[] = [{ kind: "action", label: "Copy link", icon: <Link2 />, onSelect: copyLink }];
  if (own && !post.parentId && post.status === "published") {
    menu.push(
      pinned
        ? { kind: "action", label: "Unpin from profile", icon: <PinOff />, onSelect: () => run(() => unpinPost(post.authorId), "Unpinned") }
        : { kind: "action", label: "Pin to profile", icon: <Pin />, onSelect: () => run(() => pinPost(post.id), "Pinned to your profile") },
    );
  }
  if (own) menu.push({ kind: "action", label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => setState("confirming") });
  if (viewer && !own) {
    menu.push(
      { kind: "action", label: `Mute @${post.author.username}`, icon: <VolumeX />, onSelect: () => run(() => setRelation("mute", post.authorId, true), `Muted @${post.author.username}. You can undo this in Settings.`) },
      { kind: "action", label: `Block @${post.author.username}`, icon: <UserX />, danger: true, onSelect: () => setDialog("block") },
      { kind: "action", label: "Report post", icon: <Flag />, danger: true, onSelect: () => setDialog("report") },
    );
  }

  function openPost(event: MouseEvent) {
    if (variant === "focus" || window.getSelection()?.toString()) return;
    if (event.target instanceof Element && event.target.closest("a, button, input, textarea, select, iframe, label, dialog, [role=menu]")) return;
    if (event.metaKey || event.ctrlKey || event.button === 1) window.open(href, "_blank", "noopener");
    else router.push(href);
  }

  const fold = (text: string) => {
    if (expanded) return { text, folded: false };
    const result = foldBody(text);
    return result.folded ? { text: result.preview, folded: true } : { text, folded: false };
  };
  const compactRow = variant === "reply";
  const showReplies = variant !== "focus" && variant !== "ancestor";
  const replyTotal = post.replies + post.quotes + added.length;
  // On a post's page the thread reads on below it, so only rows elsewhere link to it.
  const showsThreadLink = post.continuation > 0 && !post.authorMuted && !place && (variant === "feed" || variant === "reply");

  return (
    <article
      data-post={variant === "feed" || variant === "focus" ? post.id : undefined}
      data-href={href}
      tabIndex={-1}
      onClick={openPost}
      onAuxClick={(event) => event.button === 1 && openPost(event)}
      className={cn(
        "group/post outline-none focus:bg-primary-soft/40",
        variant !== "reply" && "border-b border-hairline",
        variant === "feed" && "cursor-pointer transition-colors hover:bg-wash/40",
        compactRow ? "py-2.5" : "px-4 py-3 sm:px-6",
      )}
    >
      <div className="flex gap-3">
        <Link href={`/@${post.author.username}`} className="shrink-0" aria-label={post.author.displayName}>
          <Avatar person={post.author} size={compactRow ? "sm" : "md"} />
        </Link>
        <div className="min-w-0 flex-1">
          <header className="flex min-w-0 items-center gap-1.5 text-[15px]">
            <Link href={`/@${post.author.username}`} className="truncate font-semibold hover:underline">
              {post.author.displayName}
            </Link>
            {post.author.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified organisation" /> : null}
            <span className="hidden truncate font-mono text-[13px] text-ink-muted sm:inline">@{post.author.username}</span>
            <span className="font-mono text-[13px] text-ink-muted">·</span>
            <Link href={href} className="shrink-0 font-mono text-[13px] text-ink-muted hover:underline">
              <LocalTime iso={post.createdAt} />
            </Link>
            {place ? <ThreadBadge place={place} /> : null}
            {post.status === "pending" ? <Chip tone="warning">{post.moderationNote ?? "Waiting for review"}</Chip> : null}
            {post.status === "rejected" ? <Chip tone="danger">Not approved</Chip> : null}
            <span className="ml-auto opacity-100 md:opacity-0 md:group-hover/post:opacity-100 md:group-focus/post:opacity-100 md:focus-within:opacity-100">
              <Menu items={menu} label="Post options" />
            </span>
          </header>

          {post.space && !thread ? (
            <Link href={`/spaces/${post.space.slug}`} className="font-mono text-xs text-ink-muted hover:text-primary">
              {post.space.emoji} {post.space.name}
            </Link>
          ) : null}
          {quotesParent ? <p className="font-mono text-xs text-ink-muted">quoted this post</p> : null}
          {post.parentId && ((variant === "feed" && !thread) || flattened) ? (
            <p className="font-mono text-xs text-ink-muted">
              ↳ replying to {post.parentUsername ? <Link href={`/@${post.parentUsername}`} className="hover:text-primary">@{post.parentUsername}</Link> : "[deleted]"}
            </p>
          ) : null}

          {state === "confirming" ? (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-destructive-soft px-3 py-2 text-sm" onClick={(event) => event.stopPropagation()}>
              <span>Delete this post? You can undo for 30 seconds.</span>
              <span className="flex gap-2">
                <button type="button" className="rounded-md px-2 py-1 hover:bg-surface" onClick={() => setState("shown")}>
                  Cancel
                </button>
                <button type="button" className="rounded-md bg-destructive px-2.5 py-1 font-medium text-white" onClick={remove}>
                  Delete
                </button>
              </span>
            </div>
          ) : null}

          {post.body ? (
            <div className={cn("mt-0.5", variant === "focus" ? "text-[17px] leading-relaxed" : "text-[15px] leading-relaxed")}>
              <Translation
                post={post}
                render={(text) => {
                  const shown = fold(text);
                  return (
                    <>
                      <RichText body={shown.text} />
                      {shown.folded ? (
                        <button
                          type="button"
                          className="mt-1 text-sm font-medium text-primary hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpanded(true);
                          }}
                        >
                          Show more
                        </button>
                      ) : null}
                    </>
                  );
                }}
              />
            </div>
          ) : null}

          {post.images.length > 0 ? <ImageGrid images={post.images} /> : null}
          {post.poll ? <PollView postId={post.id} poll={post.poll} own={own} /> : null}
          {post.linkUrl && !post.quoted ? <LinkCard url={post.linkUrl} preview={post.linkPreview} /> : null}
          {post.quoted && !quotesParent ? <QuotedBlock quoted={post.quoted} /> : null}
          {post.event ? <EventAttachment event={post.event} /> : null}
          {post.opportunity ? <OpportunityAttachment opportunity={post.opportunity} /> : null}
          {showsThreadLink ? (
            <Link
              href={href}
              aria-label={`Show thread by @${post.author.username}`}
              className="-ml-2 mt-1.5 flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-medium text-primary hover:bg-wash"
            >
              <ListTree className="size-4" aria-hidden />
              Show thread
            </Link>
          ) : null}

          {variant === "focus" ? (
            <p className="mt-3 font-mono text-[13px] text-ink-muted">
              <LocalTime iso={post.createdAt} format="full" />
            </p>
          ) : null}

          {variant !== "ancestor" ? (
            <footer className="-ml-2 mt-1.5 flex items-center gap-1 text-ink-muted" onClick={(event) => event.stopPropagation()}>
              <Action owner={post.id} label="Reply" shortcut="r" onClick={() => (viewer ? setReplying((value) => !value) : signIn())} count={variant === "reply" ? post.replies : 0}>
                <MessageCircle />
              </Action>
              {!post.parentId && post.status === "published" ? (
                <Action owner={post.id} label="Quote" shortcut="q" onClick={() => (viewer ? setQuoting(true) : signIn())} count={post.quotes}>
                  <Repeat2 />
                </Action>
              ) : null}
              {!own ? (
                <Action label={liked ? "Unlike" : "Like"} onClick={toggleLike} count={likes} active={liked}>
                  <Heart className={cn(liked && "fill-current")} />
                </Action>
              ) : likes > 0 ? (
                <span className="flex items-center gap-1.5 px-2 font-mono text-[13px]" title="Likes">
                  <Heart className="size-4" /> {compact(likes)}
                </span>
              ) : null}
              <Action label={saved ? "Remove from saved" : "Save"} onClick={toggleSave} active={saved}>
                <Bookmark className={cn(saved && "fill-current")} />
              </Action>
              <Action owner={post.id} label="Copy link" shortcut="y" onClick={copyLink}>
                <Link2 />
              </Action>
            </footer>
          ) : null}
        </div>
      </div>

      {replying ? (
        <div className={cn("mt-2", compactRow ? "ml-10" : "ml-[3.25rem]")}>
          <Composer
            mode={{ kind: "reply", parent: post }}
            autoFocus
            onCancel={() => setReplying(false)}
            onPosted={(row) => {
              setReplying(false);
              if (variant === "focus") router.refresh();
              else setAdded((current) => [...current, row]);
            }}
          />
        </div>
      ) : null}

      {showReplies && replyTotal > 0 ? (
        <div className={depth >= MAX_INDENT ? "" : compactRow ? "ml-10" : "ml-[3.25rem]"}>
          <Replies postId={post.id} total={replyTotal} depth={depth} added={added} />
        </div>
      ) : null}

      <Dialog open={quoting} onClose={() => setQuoting(false)} title={`Quote @${post.author.username}`}>
        <Composer mode={{ kind: "quote", quoted: post }} autoFocus onCancel={() => setQuoting(false)} onPosted={() => setQuoting(false)} />
      </Dialog>
      <ReportDialog target={dialog === "report" ? { targetType: "post", targetId: post.id } : null} onClose={() => setDialog("none")} what="post" />
      <ConfirmBlockDialog
        profile={{ id: post.authorId, username: post.author.username, displayName: post.author.displayName }}
        open={dialog === "block"}
        onClose={() => setDialog("none")}
        onBlocked={() => {
          setDialog("none");
          router.refresh();
        }}
      />
    </article>
  );
}

function ThreadBadge({ place: { position, size, capped } }: { place: ThreadPlace }) {
  return (
    <span title={`Post ${position} of ${size}${capped ? " or more" : ""} in this thread`} className="shrink-0 rounded-full bg-wash px-2 py-0.5 font-mono text-xs text-ink-muted tabular">
      {position}/{size}
      {capped ? "+" : null}
    </span>
  );
}

// On a post's own page, deleting keeps the reader there with an Undo.
function DeletedHere({ postId, onRestored }: { postId: string; onRestored: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <article className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-4 text-sm sm:px-6">
      <span className="text-ink-muted">You deleted this post.</span>
      <button
        type="button"
        disabled={pending}
        className="font-medium text-primary hover:underline disabled:opacity-60"
        onClick={() =>
          startTransition(async () => {
            const result = await restorePost(postId);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            onRestored();
          })
        }
      >
        Undo
      </button>
    </article>
  );
}

function Action({
  owner,
  label,
  shortcut,
  onClick,
  count: total = 0,
  active,
  children,
}: {
  owner?: string;
  label: string;
  shortcut?: string;
  onClick: (event: MouseEvent) => void;
  count?: number;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      data-for={owner}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("flex h-8 min-w-8 items-center gap-1.5 rounded-md px-2 font-mono text-[13px] tabular transition-colors hover:bg-wash hover:text-ink [&_svg]:size-4", active && "text-primary hover:text-primary")}
    >
      {children}
      {total > 0 ? compact(total) : null}
    </button>
  );
}

type RepliesState = { kind: "closed" } | { kind: "loading" } | { kind: "open"; rows: PostRow[]; next: string | null };

// Threads expand in place under a post, a page at a time. Replies the reader
// just wrote (`added`) show straight away.
function Replies({ postId, total, depth, added }: { postId: string; total: number; depth: number; added: PostRow[] }) {
  const [state, setState] = useState<RepliesState>({ kind: "closed" });
  const [, startTransition] = useTransition();

  function load(after: string | null, previous: PostRow[] = []) {
    setState(previous.length ? { kind: "open", rows: previous, next: null } : { kind: "loading" });
    startTransition(async () => {
      try {
        const page = await loadMoreReplies(postId, after);
        setState({ kind: "open", rows: [...previous, ...page.replies], next: page.next });
      } catch {
        toast.error("Couldn't load the replies. Try again.");
        setState(previous.length ? { kind: "open", rows: previous, next: after } : { kind: "closed" });
      }
    });
  }

  const loaded = state.kind === "open" ? state.rows : [];
  const rows = [...loaded, ...added.filter((row) => !loaded.some((item) => item.id === row.id))];
  const remaining = total - rows.length;
  const thread = { parentId: postId, depth: depth + 1 };

  return (
    <div onClick={(event) => event.stopPropagation()}>
      {rows.length > 0 ? (
        <div className={cn("mt-1", depth + 1 <= MAX_INDENT && "border-l border-rail pl-3")}>
          {rows.map((row) => (
            <PostItem key={row.id} row={row} variant="reply" thread={thread} />
          ))}
        </div>
      ) : null}
      <div className="flex gap-4 py-1 text-sm">
        {state.kind === "open" && state.next ? (
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => load(state.next, state.rows)}>
            Show more replies
          </button>
        ) : null}
        {state.kind !== "open" && remaining > 0 ? (
          <button type="button" aria-keyshortcuts="o" data-for={postId} onClick={() => load(null)} disabled={state.kind === "loading"} className="font-medium text-primary hover:underline disabled:opacity-60">
            {state.kind === "loading" ? "Loading…" : rows.length > 0 ? `Show ${count(remaining, "more reply", "more replies")}` : count(total, "reply", "replies")}
          </button>
        ) : null}
        {state.kind === "open" ? (
          <button type="button" aria-keyshortcuts="o" data-for={postId} className="text-ink-muted hover:text-ink" onClick={() => setState({ kind: "closed" })}>
            Hide replies
          </button>
        ) : null}
      </div>
    </div>
  );
}
