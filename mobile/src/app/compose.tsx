import { router, useLocalSearchParams } from "expo-router";
import { BarChart3, CalendarClock, ChevronDown, ImagePlus, Languages, Link2, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { languageName, LANGUAGES, LIMITS } from "@/lib/catalogue";
import type { Post } from "@/lib/domain";
import { fullDate } from "@/lib/format";
import { findPersonalInfo, personalInfoWarning } from "@/lib/personal-info";
import { POLL_OPTIONS } from "@/lib/post-form";
import { allUrls, displayUrl, FOLD_HINT, foldsInLists, tokenize } from "@/lib/text";
import { clearDraft, keepDraft, readDraft } from "@/data/drafts";
import { createPost, loadPost, MEDIA_URL, schedulePost } from "@/data/posts";
import { useViewer } from "@/data/session";
import { supabase } from "@/data/supabase";
import { pickImages, uploadImage, type PickedImage } from "@/data/upload";
import { awaitCard, QuotedBlock } from "@/post/attachments";
import { ImageTray } from "@/post/composer/images";
import { MentionList, mentionAt, useMentionSuggestions } from "@/post/composer/mentions";
import { newPoll, PollEditor, type PollDraft } from "@/post/composer/poll-editor";
import { problemWith, ScheduleSheet } from "@/post/composer/schedule";
import { RichText } from "@/post/rich-text";
import { useRulesGate } from "@/post/rules-sheet";
import { Avatar } from "@/ui/avatar";
import { FieldError, KeyboardSheet, SheetHeader, useKeyboardOpen } from "@/ui/form";
import { ActionSheet, type SheetAction } from "@/ui/sheet";
import { font, Text, type } from "@/ui/text";
import { HAIRLINE, usePalette } from "@/ui/theme";
import { toast } from "@/ui/toast";
import { emitPostCreated } from "@/util/events";
import { timeZone } from "@/util/time";

// What the composer is writing. Its scope names the draft kept on the phone,
// so a reply and a space post never overwrite each other.
type Mode =
  | { kind: "post"; spaceId: string | null; eventId: string | null; opportunityId: string | null }
  | { kind: "reply"; parent: Post }
  | { kind: "quote"; quoted: Post };

const params = z.object({
  reply: z.uuid().optional(),
  quote: z.uuid().optional(),
  space: z.uuid().optional(),
  event: z.uuid().optional(),
  opportunity: z.uuid().optional(),
  // Text to start with, such as "@name " for a welcome.
  text: z.string().max(200).optional(),
  placeholder: z.string().max(80).optional(),
});

function scopeOf(mode: Mode) {
  switch (mode.kind) {
    case "reply":
      return `reply:${mode.parent.id}`;
    case "quote":
      return `quote:${mode.quoted.id}`;
    case "post":
      if (mode.eventId) return `event:${mode.eventId}`;
      if (mode.opportunityId) return `opportunity:${mode.opportunityId}`;
      return `post:${mode.spaceId ?? "home"}`;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

type Loading = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; mode: Mode };

export default function ComposeScreen() {
  const parsed = params.safeParse(useLocalSearchParams());
  const query = parsed.data ?? {};
  const target = query.reply ?? query.quote ?? null;
  const [loaded, setLoaded] = useState<{ id: string | null; state: Loading }>({ id: null, state: { kind: "loading" } });

  useEffect(() => {
    if (!target) return;
    let current = true;
    void loadPost(target)
      .then((row) => {
        if (!current) return;
        if (!row || row.kind === "tombstone") return setLoaded({ id: target, state: { kind: "missing" } });
        setLoaded({ id: target, state: { kind: "ready", mode: query.reply ? { kind: "reply", parent: row } : { kind: "quote", quoted: row } } });
      })
      .catch(() => current && setLoaded({ id: target, state: { kind: "missing" } }));
    return () => {
      current = false;
    };
  }, [target, query.reply]);

  const state: Loading = !target
    ? { kind: "ready", mode: { kind: "post", spaceId: query.space ?? null, eventId: query.event ?? null, opportunityId: query.opportunity ?? null } }
    : loaded.id === target
      ? loaded.state
      : { kind: "loading" };

  if (state.kind !== "ready") return <Waiting missing={state.kind === "missing"} />;
  return <Composer key={scopeOf(state.mode)} mode={state.mode} initialText={query.text ?? ""} placeholder={query.placeholder} />;
}

function Waiting({ missing }: { missing: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface }}>
      <SheetHeader title={missing ? "Post unavailable" : "Loading"} onCancel={() => router.back()} cancelLabel={missing ? "Close" : "Cancel"} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        {missing ? (
          <Text variant="callout" tone="muted" style={{ textAlign: "center" }}>
            The post may have been deleted, or it isn't available to you.
          </Text>
        ) : (
          <ActivityIndicator color={palette.inkMuted} accessibilityLabel="Loading the post" />
        )}
      </View>
    </View>
  );
}

function Composer({ mode, initialText, placeholder }: { mode: Mode; initialText: string; placeholder?: string }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const viewer = useViewer();
  const rules = useRulesGate();
  const scope = scopeOf(mode);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // Set before the rules sheet and the upload, which `busy` waits for, so a second tap can't post twice.
  const sending = useRef(false);

  const [body, setBody] = useState(() => (viewer ? readDraft(viewer.id, scope) : "") || initialText);
  // The caret and the text as typed live in refs, so moving the caret redraws
  // nothing; only the mention being typed at it is state. Whichever of the
  // text and selection events comes second finds the mention.
  const caret = useRef(body.length);
  const typed = useRef(body);
  const [typing, setTyping] = useState<ReturnType<typeof mentionAt>>(null);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [poll, setPoll] = useState<PollDraft | null>(null);
  const [schedule, setSchedule] = useState<Date | null>(null);
  const [scheduling, setScheduling] = useState(false);
  // A reply starts in the language of the post it answers, when the viewer speaks it.
  const [language, setLanguage] = useState(() => (mode.kind === "reply" && viewer?.languages.includes(mode.parent.language) ? mode.parent.language : (viewer?.languages[0] ?? "en")));
  const [authorId, setAuthorId] = useState<string | null>(null);
  // undefined: the first link; null: no card; else the link chosen.
  const [cardChoice, setCardChoice] = useState<string | null | undefined>(undefined);
  const [sheet, setSheet] = useState<"language" | "author" | "card" | "close" | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const findMention = (text: string, at: number) => {
    const found = mentionAt(text, at);
    setTyping((current) => (current?.start === found?.start && current?.end === found?.end && current?.query === found?.query ? current : found));
  };
  const edit = (text: string) => {
    typed.current = text;
    setBody(text);
    findMention(text, caret.current);
  };
  const people = useMentionSuggestions(typing?.query ?? null, {
    replyTo: mode.kind === "reply" ? mode.parent.id : null,
    quoteOf: mode.kind === "quote" ? mode.quoted.id : null,
  });

  if (!viewer) return null;

  const identities = [{ id: viewer.id, displayName: viewer.displayName, username: viewer.username, avatarUrl: viewer.avatarUrl, colour: viewer.colour }, ...viewer.organisations];
  const author = identities.find((identity) => identity.id === (authorId ?? viewer.id)) ?? identities[0];
  const remaining = LIMITS.postBody - body.length;
  const links = allUrls(body);
  const card = mode.kind === "quote" || cardChoice === null ? null : cardChoice && links.includes(cardChoice) ? cardChoice : (links[0] ?? null);
  const hasAttachment = images.length > 0 || mode.kind === "quote" || (mode.kind === "post" && Boolean(mode.eventId ?? mode.opportunityId));
  const pollValid = !poll || poll.options.filter((option) => option.trim()).length >= POLL_OPTIONS.min;
  const schedulable = mode.kind === "post" && !mode.eventId && !mode.opportunityId;
  const scheduleError = schedule ? problemWith(schedule) : null;
  // Why Post is off, said under the text, since a greyed button can't be asked.
  const blocker = viewer.suspended
    ? "suspended"
    : remaining < 0
      ? `Too long by ${-remaining} ${remaining === -1 ? "character" : "characters"}.`
      : body.trim().length === 0 && !hasAttachment
        ? "Write something first."
        : !pollValid
          ? "Give the poll at least two options."
          : scheduleError;
  const title = mode.kind === "reply" ? "Reply" : mode.kind === "quote" ? "Quote post" : schedule ? "Schedule post" : "New post";
  const action = schedule ? "Schedule" : mode.kind === "reply" ? "Reply" : "Post";
  const hint =
    mode.kind === "reply" ? `Reply to @${mode.parent.author.username}` : mode.kind === "quote" ? "Add your take" : (placeholder ?? "What's happening in your community?");

  const insertMention = (username: string) => {
    if (!typing) return;
    const next = `${body.slice(0, typing.start)}@${username} ${body.slice(typing.end)}`;
    caret.current = typing.start + username.length + 2;
    edit(next);
  };

  async function addImages() {
    if (poll) return Alert.alert("A post can have a poll or photos, not both.");
    const room = LIMITS.images - images.length;
    const picked = await pickImages(room);
    if (picked.length === 0) return;
    setImages((current) => [...current, ...picked].slice(0, LIMITS.images));
    setActiveImage(picked[0]?.key ?? null);
  }

  function close() {
    if (body.trim().length === 0 && images.length === 0 && !poll) {
      if (viewer) clearDraft(viewer.id, scope);
      return router.back();
    }
    setSheet("close");
  }

  function submit(checked = false) {
    if (blocker !== null || busy) return;
    const found = checked ? [] : findPersonalInfo(body);
    if (found.length > 0) {
      // Edit is the default, on the right; Post anyway on the left, as Apple orders alert buttons.
      return Alert.alert("Check before you post", personalInfoWarning(found), [
        { text: "Post anyway", onPress: () => submit(true) },
        { text: "Edit", isPreferred: true, onPress: () => input.current?.focus() },
      ]);
    }
    if (sending.current) return;
    sending.current = true;
    void rules.ensure().then(async (accepted) => {
      try {
        if (accepted) await send();
      } finally {
        sending.current = false;
      }
    });
  }

  async function removeUploaded(paths: string[]) {
    if (paths.length > 0) await supabase.storage.from("media").remove(paths);
  }

  async function send() {
    if (!viewer) return;
    setBusy(true);
    setUploadError(null);
    const uploaded: string[] = [];
    const sentImages = [];
    // Photos go one at a time; the post can't go up without them.
    for (const image of images) {
      const result = await uploadImage(image, { bucket: "media", folder: "posts", ownerId: author?.id ?? viewer.id });
      if (!result.ok) {
        await removeUploaded(uploaded);
        setBusy(false);
        return setUploadError(result.error);
      }
      uploaded.push(result.data.path);
      sentImages.push({ ...result.data, url: `${MEDIA_URL}${result.data.path}`, alt: image.alt.trim() });
    }
    const post = {
      body,
      language,
      authorId: author && author.id !== viewer.id ? author.id : null,
      spaceId: mode.kind === "post" ? mode.spaceId : null,
      linkUrl: card,
      images: sentImages,
      poll: poll && { options: poll.options.map((option) => option.trim()).filter(Boolean), durationHours: poll.durationHours },
    };

    if (schedule) {
      const result = await schedulePost({ ...post, scheduledAt: schedule.toISOString() });
      setBusy(false);
      if (!result.ok) {
        await removeUploaded(uploaded);
        return Alert.alert("Couldn't schedule this post", result.error);
      }
      clearDraft(viewer.id, scope);
      router.back();
      return toast(`Scheduled for ${fullDate(schedule.toISOString(), timeZone)}`, { action: { label: "View scheduled", onPress: () => router.push("/scheduled") } });
    }

    const result = await createPost({
      ...post,
      parentId: mode.kind === "reply" ? mode.parent.id : null,
      quoteId: mode.kind === "quote" ? mode.quoted.id : null,
      eventId: mode.kind === "post" ? mode.eventId : null,
      opportunityId: mode.kind === "post" ? mode.opportunityId : null,
    });
    setBusy(false);
    if (!result.ok) {
      await removeUploaded(uploaded);
      return Alert.alert("Couldn't post", result.error);
    }
    const created = result.data;
    if (created.kind === "post" && created.linkUrl && !created.linkPreview && !created.quoteId) awaitCard(created.linkUrl, created.id);
    clearDraft(viewer.id, scope);
    emitPostCreated({
      id: created.id,
      parentId: created.parentId,
      quoteId: created.kind === "post" ? created.quoteId : null,
      spaceId: post.spaceId ?? null,
      topics: tokenize(body).flatMap((segment) => (segment.kind === "topic" ? [segment.topic] : [])),
    });
    router.back();
    const held = created.kind === "post" && created.status === "pending";
    toast(held ? "Sent for review. A moderator will check it, usually within a day." : mode.kind === "reply" ? "Reply posted" : "Posted", {
      action: held || mode.kind === "reply" ? undefined : { label: "View", onPress: () => router.push(`/post/${created.id}`) },
    });
  }

  const closeActions: SheetAction[] = [
    {
      label: "Delete draft",
      destructive: true,
      onPress: () => {
        clearDraft(viewer.id, scope);
        router.back();
      },
    },
    {
      label: "Keep draft",
      onPress: () => {
        // Drafts with a phone or card number are never kept, as on the website.
        if (!keepDraft(viewer.id, scope, body)) toast("This draft has personal details in it, so it wasn't kept.");
        router.back();
      },
    },
  ];

  const sheetActions: Record<"language" | "author" | "card", SheetAction[]> = {
    language: LANGUAGES.map((option) => ({ label: option.name, checked: option.code === language, onPress: () => setLanguage(option.code) })),
    author: identities.map((identity) => ({ label: identity.id === viewer.id ? `You (@${identity.username})` : identity.displayName, checked: identity.id === author?.id, onPress: () => setAuthorId(identity.id) })),
    card: [...links.map((link) => ({ label: displayUrl(link), checked: link === card, onPress: () => setCardChoice(link) })), { label: "No link card", checked: card === null, onPress: () => setCardChoice(null) }],
  };

  const tool = (label: string, icon: typeof ImagePlus, onPress: () => void, disabled = false, on = false) => {
    const Icon = icon;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, selected: on }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: pressed || on ? palette.primarySoft : "transparent" })}
      >
        <Icon size={22} color={disabled ? palette.rail : palette.primary} strokeWidth={2} />
      </Pressable>
    );
  };

  return (
    <KeyboardSheet style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: palette.surface }}>
      <SheetHeader
        title={title}
        onCancel={close}
        action={{ label: action, onPress: () => submit(), disabled: blocker !== null, busy, hint: blocker && blocker !== "suspended" ? blocker : undefined }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 }}>
        {viewer.suspended ? (
          <View accessibilityRole="alert" style={{ padding: 14, borderRadius: 12, backgroundColor: palette.warning }}>
            <Text variant="callout">
              {viewer.suspendedUntil
                ? `Your account is suspended until ${fullDate(viewer.suspendedUntil, timeZone)}, so you can't post, like, follow or message until then.`
                : "Your account is banned, so you can't post."}{" "}
              The reason and how to ask for another look are in your notifications.
            </Text>
          </View>
        ) : null}
        {mode.kind === "reply" ? <ReplyingTo parent={mode.parent} /> : null}
        {identities.length > 1 && mode.kind !== "quote" ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Posting as ${author?.displayName ?? "you"}. Change`} onPress={() => setSheet("author")} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 36 }}>
            <Text variant="subhead" tone="muted">
              Posting as
            </Text>
            <Text variant="subhead" tone="primary" style={{ fontFamily: font.semibold }}>
              {author && author.id !== viewer.id ? author.displayName : "you"}
            </Text>
            <ChevronDown size={16} color={palette.primary} />
          </Pressable>
        ) : null}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {author ? <Avatar person={author} size={40} /> : null}
          <TextInput
            ref={input}
            accessibilityLabel={mode.kind === "reply" ? "Reply text" : "Post text"}
            placeholder={hint}
            placeholderTextColor={palette.inkMuted}
            value={body}
            onChangeText={edit}
            onSelectionChange={(event) => {
              caret.current = event.nativeEvent.selection.end;
              findMention(typed.current, caret.current);
            }}
            multiline
            autoFocus
            maxLength={LIMITS.postBody + 200}
            scrollEnabled={false}
            editable={!busy}
            style={[type.focus, { flex: 1, minHeight: 120, paddingTop: 8, color: palette.ink }]}
          />
        </View>
        {blocker && blocker !== "suspended" && body.length > 0 ? (
          <Text variant="small" tone={remaining < 0 ? "destructive" : "muted"} accessibilityLiveRegion="polite">
            {blocker}
          </Text>
        ) : null}
        {remaining >= 500 && foldsInLists(body) ? (
          <Text variant="small" tone="muted">
            {FOLD_HINT}
          </Text>
        ) : null}
        {uploadError ? (
          <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: palette.destructiveSoft }}>
            <Text variant="subhead" tone="destructive" style={{ flex: 1 }}>
              {uploadError}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => submit(true)} hitSlop={6}>
              <Text variant="subhead" tone="destructive" style={{ fontFamily: font.semibold }}>
                Retry
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setUploadError(null)} hitSlop={6}>
              <X size={18} color={palette.destructive} />
            </Pressable>
          </View>
        ) : null}
        <ImageTray
          images={images}
          active={activeImage}
          onSelect={setActiveImage}
          onRemove={(key) => setImages((current) => current.filter((image) => image.key !== key))}
          onDescribe={(key, alt) => setImages((current) => current.map((image) => (image.key === key ? { ...image, alt } : image)))}
        />
        {poll ? <PollEditor poll={poll} onChange={setPoll} onRemove={() => setPoll(null)} /> : null}
        {links.length > 0 && mode.kind !== "quote" ? (
          <Pressable accessibilityRole="button" onPress={() => setSheet("card")} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 }}>
            <Link2 size={16} color={palette.inkMuted} />
            <Text variant="subhead" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {card ? `Link card: ${displayUrl(card)}` : "No link card"}
            </Text>
            <ChevronDown size={16} color={palette.inkMuted} />
          </Pressable>
        ) : null}
        {mode.kind === "quote" ? <QuotedBlock quoted={{ kind: "post", id: mode.quoted.id, body: mode.quoted.body, createdAt: mode.quoted.createdAt, author: mode.quoted.author, image: mode.quoted.images[0] ?? null }} /> : null}
        {schedule ? (
          <Pressable accessibilityRole="button" onPress={() => setScheduling(true)} style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", minHeight: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: palette.primarySoft }}>
            <CalendarClock size={16} color={palette.primary} />
            <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }}>
              {fullDate(schedule.toISOString(), timeZone)}
            </Text>
          </Pressable>
        ) : null}
        {scheduleError ? <FieldError>{scheduleError}</FieldError> : null}
      </ScrollView>
      <MentionList people={people} onPick={(person) => insertMention(person.username)} />
      <Toolbar>
        {mode.kind === "quote" ? null : tool("Add photos", ImagePlus, () => void addImages(), images.length >= LIMITS.images || poll !== null)}
        {mode.kind === "post" ? tool(poll ? "Remove poll" : "Add a poll", BarChart3, () => setPoll(poll ? null : newPoll()), images.length > 0, poll !== null) : null}
        {schedulable ? tool(schedule ? "Change the scheduled time" : "Schedule for later", CalendarClock, () => setScheduling(true), false, schedule !== null) : null}
        <View style={{ flex: 1 }} />
        {remaining < 500 ? (
          <Text variant="meta" tone={remaining < 0 ? "destructive" : "muted"} accessibilityLabel={`${remaining} characters left`}>
            {remaining}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Language of this post: ${languageName(language)}`}
          onPress={() => setSheet("language")}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12 }}
        >
          <Languages size={18} color={palette.primary} />
          <Text variant="subhead" tone="primary" style={{ fontFamily: font.medium }} maxFontSizeMultiplier={1.4}>
            {languageName(language)}
          </Text>
        </Pressable>
      </Toolbar>
      <ActionSheet title="Language of this post" actions={sheetActions.language} open={sheet === "language"} onClose={() => setSheet(null)} />
      <ActionSheet title="Post as" actions={sheetActions.author} open={sheet === "author"} onClose={() => setSheet(null)} />
      <ActionSheet title="Link card" actions={sheetActions.card} open={sheet === "card"} onClose={() => setSheet(null)} />
      <ActionSheet title="Keep this draft?" actions={closeActions} open={sheet === "close"} onClose={() => setSheet(null)} cancelLabel="Keep writing" />
      <ScheduleSheet open={scheduling} value={schedule} onDone={setSchedule} onClear={() => setSchedule(null)} onClose={() => setScheduling(false)} />
      {rules.sheet}
    </KeyboardSheet>
  );
}

// The post being answered sits above, joined by the thread line.
function ReplyingTo({ parent }: { parent: Post }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={{ alignItems: "center" }}>
        <Avatar person={parent.author} size={40} />
        <View style={{ flex: 1, width: 2, marginTop: 4, borderRadius: 1, backgroundColor: palette.rail }} />
      </View>
      <View style={{ flex: 1, gap: 4, paddingBottom: 6 }}>
        <Text variant="name">{parent.author.displayName}</Text>
        <RichText body={parent.body} variant="callout" numberOfLines={6} />
        <Text variant="caption" tone="muted">
          Replying to <Text variant="caption" tone="primary">@{parent.author.username}</Text>
        </Text>
      </View>
    </View>
  );
}

// Above the keyboard it sits right on it; without one, clear of the home indicator.
function Toolbar({ children }: { children: ReactNode }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  return (
    <View
      accessibilityRole="toolbar"
      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingTop: 6, paddingBottom: keyboard ? 6 : Math.max(insets.bottom, 6), borderTopWidth: HAIRLINE, borderTopColor: palette.hairline, backgroundColor: palette.surface }}
    >
      {children}
    </View>
  );
}
