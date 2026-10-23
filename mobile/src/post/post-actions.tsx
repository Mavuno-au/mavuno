import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Bookmark, BookmarkCheck, Copy, Link2, Pin, PinOff, Trash2 } from "lucide-react-native";
import { Alert } from "react-native";
import type { Post } from "@/lib/domain";
import { fail, type Result } from "@/lib/result";
import { deletePost, pinPost, restorePost, setSaved, unpinPost } from "@/data/posts";
import { useSession, useViewer } from "@/data/session";
import { useShadowWriter } from "@/data/shadow";
import type { SheetAction } from "@/ui/sheet";
import { usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { emitProfileChanged } from "@/util/events";
import { haptics } from "@/util/haptics";
import { postLink } from "@/util/links";
import { useSafetyActions } from "@/util/safety";
import { useToggleQueue } from "@/util/toggle-queue";

// The database keeps a deleted post's content for 30 seconds; Undo stays a
// little shorter so it never arrives after the content is gone.
const UNDO_MS = 28_000;

// Whether the viewer may act for the post's author: it's theirs, or an
// organisation's they help run. The database decides in the end.
export function useActsFor(authorId: string) {
  const viewer = useViewer();
  return viewer !== null && (viewer.id === authorId || viewer.organisations.some((organisation) => organisation.id === authorId));
}

export function useSaveToggle(post: Post) {
  const session = useSession();
  const viewerId = session.kind === "signed-in" ? session.session.user.id : null;
  const { setSaved: shadowSaved } = useShadowWriter();
  const toggle = useToggleQueue({
    run: (on) => (viewerId ? setSaved(viewerId, post.id, on) : Promise.resolve(fail("Sign in first."))),
    onSettled: (saved) => shadowSaved(post.id, saved),
    onError: (message, on) => toast(`${on ? "Couldn't save this post" : "Couldn't remove it from Saved"}. ${message}`, { tone: "error" }),
  });
  return () => {
    const next = !post.saved;
    haptics.tap();
    shadowSaved(post.id, next);
    toggle(next, post.saved);
    if (next) toast("Saved", { action: { label: "View saved", onPress: () => router.push("/saved") } });
  };
}

// Deleting isn't confirmed: it can be undone for 30 seconds, and Apple
// advises against confirming what can be undone (the iPhone design's notes).
function useDeletePost() {
  const { setDeleted } = useShadowWriter();
  return async (post: Post) => {
    setDeleted(post.id, true);
    const result = await deletePost(post.id);
    if (!result.ok) {
      setDeleted(post.id, false);
      return Alert.alert("Couldn't delete this post", result.error);
    }
    toast("Post deleted", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onPress: () =>
          void restorePost(post.id).then((restored) => {
            if (restored.ok) setDeleted(post.id, false);
            else Alert.alert("Couldn't bring it back", restored.error);
          }),
      },
    });
  };
}

// The post menu, in the website's order: Save, Copy link, Pin, Delete for your
// own; then Mute, Block and Report for someone else's, below a divider. Copy
// text sits beside Copy link, as on Bluesky, since a row's text can't be selected.
// `save` is the row's own useSaveToggle, shared with its bookmark.
export function usePostMenu(post: Post, save: () => void, { pinnedHere = false }: { pinnedHere?: boolean } = {}): SheetAction[] {
  const palette = usePalette();
  const own = useActsFor(post.authorId);
  const remove = useDeletePost();
  const safety = useSafetyActions({ id: post.authorId, username: post.author.username, muted: post.authorMuted });
  const topLevel = post.parentId === null && post.status === "published";
  const icon = { size: 20, color: palette.inkMuted };

  const actions: SheetAction[] = [
    { label: post.saved ? "Remove from Saved" : "Save", icon: post.saved ? <BookmarkCheck {...icon} color={palette.primary} /> : <Bookmark {...icon} />, onPress: save },
    {
      label: "Copy link",
      icon: <Link2 {...icon} />,
      onPress: () => void Clipboard.setStringAsync(postLink(post)).then(() => toast("Link copied")),
    },
  ];
  if (post.body.trim()) actions.push({ label: "Copy text", icon: <Copy {...icon} />, onPress: () => void Clipboard.setStringAsync(post.body).then(() => toast("Text copied")) });
  if (own && topLevel) {
    // The profile shows its pinned post above the feed, so it reads itself again.
    const pinned = (result: Result, done: string, failed: string) => {
      if (!result.ok) return toast(`${failed} ${result.error}`, { tone: "error" });
      toast(done);
      emitProfileChanged(post.authorId);
    };
    actions.push(
      pinnedHere
        ? { label: "Unpin from profile", icon: <PinOff {...icon} />, onPress: () => void unpinPost(post.authorId).then((result) => pinned(result, "Unpinned", "Couldn't unpin.")) }
        : { label: "Pin to profile", icon: <Pin {...icon} />, onPress: () => void pinPost(post.id).then((result) => pinned(result, "Pinned to your profile", "Couldn't pin.")) },
    );
  }
  if (own) actions.push({ label: "Delete post", icon: <Trash2 size={20} color={palette.destructive} />, destructive: true, onPress: () => void remove(post) });
  else actions.push(...safety.actions({ report: { type: "post", id: post.id } }));
  return actions;
}
