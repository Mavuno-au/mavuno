-- Two fixes from Supabase's database advisors.
--
-- 1. Policies call (select auth.uid()) so Postgres evaluates it once per query
--    instead of once per row.
-- 2. Every foreign key gets an index, so joins and the cascades that run when
--    an account or post is deleted don't scan whole tables.

alter policy "People block" on public.blocks
  with check ((blocker_id = (select auth.uid())));

alter policy "People see their blocks" on public.blocks
  using ((blocker_id = (select auth.uid())));

alter policy "People unblock" on public.blocks
  using ((blocker_id = (select auth.uid())));

alter policy "People update their own participation" on public.conversation_participants
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "People RSVP as themselves" on public.event_rsvps
  with check (((user_id = (select auth.uid())) AND is_active_member()));

alter policy "People change their RSVP" on public.event_rsvps
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "People withdraw their RSVP" on public.event_rsvps
  using ((user_id = (select auth.uid())));

alter policy "RSVPs are visible with their event" on public.event_rsvps
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_rsvps.event_id) AND ((e.status = 'published'::content_status) OR can_act_as(e.host_id)))))));

alter policy "Hosts create events" on public.events
  with check ((can_act_as(host_id) AND (created_by = (select auth.uid())) AND is_active_member()));

alter policy "People follow as themselves" on public.follows
  with check (((follower_id = (select auth.uid())) AND is_active_member() AND (NOT is_blocked_with_viewer(followee_id))));

alter policy "People unfollow as themselves" on public.follows
  using ((follower_id = (select auth.uid())));

alter policy "People like others' posts" on public.likes
  with check (((user_id = (select auth.uid())) AND is_active_member() AND can_see_post(post_id) AND (NOT (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = likes.post_id) AND can_act_as(p.author_id)))))));

alter policy "People unlike" on public.likes
  using ((user_id = (select auth.uid())));

alter policy "Participants react" on public.message_reactions
  with check (((user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM messages m
  WHERE ((m.id = message_reactions.message_id) AND (m.removed_at IS NULL) AND is_accepted_participant(m.conversation_id))))));

alter policy "People remove their reactions" on public.message_reactions
  using ((user_id = (select auth.uid())));

alter policy "Accepted participants send messages" on public.messages
  with check (((sender_id = (select auth.uid())) AND is_accepted_participant(conversation_id) AND is_active_member()));

alter policy "People mute" on public.mutes
  with check ((muter_id = (select auth.uid())));

alter policy "People see their mutes" on public.mutes
  using ((muter_id = (select auth.uid())));

alter policy "People unmute" on public.mutes
  using ((muter_id = (select auth.uid())));

alter policy "Posters create opportunities" on public.opportunities
  with check ((can_act_as(poster_id) AND (created_by = (select auth.uid())) AND is_active_member()));

alter policy "Owners and admins remove members, anyone leaves" on public.organisation_members
  using (((can_manage_org(org_id) AND (role <> 'owner'::org_role)) OR (user_id = (select auth.uid()))));

alter policy "People see their own votes" on public.poll_votes
  using ((user_id = (select auth.uid())));

alter policy "Published posts are public" on public.posts
  using (((status = 'published'::content_status) OR (created_by = (select auth.uid())) OR can_act_as(author_id) OR is_moderator()));

alter policy "People save opportunities" on public.saved_opportunities
  with check ((user_id = (select auth.uid())));

alter policy "People unsave opportunities" on public.saved_opportunities
  using ((user_id = (select auth.uid())));

alter policy "Saved opportunities are private" on public.saved_opportunities
  using ((user_id = (select auth.uid())));

alter policy "People save posts they can see" on public.saves
  with check (((user_id = (select auth.uid())) AND can_see_post(post_id)));

alter policy "People unsave" on public.saves
  using ((user_id = (select auth.uid())));

alter policy "Saved posts are private" on public.saves
  using ((user_id = (select auth.uid())));

alter policy "People join spaces" on public.space_members
  with check (((user_id = (select auth.uid())) AND (role = 'member'::space_role) AND is_active_member()));

alter policy "People leave spaces" on public.space_members
  using (((user_id = (select auth.uid())) AND (role <> 'owner'::space_role)));

create index conversations_created_by_idx on public.conversations (created_by);
create index events_created_by_idx on public.events (created_by);
create index events_space_id_idx on public.events (space_id);
create index message_reactions_user_id_idx on public.message_reactions (user_id);
create index messages_reply_to_id_idx on public.messages (reply_to_id);
create index moderation_actions_moderator_id_idx on public.moderation_actions (moderator_id);
create index mutes_muted_id_idx on public.mutes (muted_id);
create index notifications_actor_id_idx on public.notifications (actor_id);
create index notifications_event_id_idx on public.notifications (event_id);
create index opportunities_created_by_idx on public.opportunities (created_by);
create index poll_votes_option_id_idx on public.poll_votes (option_id);
create index poll_votes_user_id_idx on public.poll_votes (user_id);
create index posts_event_id_idx on public.posts (event_id);
create index posts_opportunity_id_idx on public.posts (opportunity_id);
create index profiles_pinned_post_id_idx on public.profiles (pinned_post_id);
create index saved_opportunities_opportunity_id_idx on public.saved_opportunities (opportunity_id);
create index saves_post_id_idx on public.saves (post_id);
create index spaces_city_id_idx on public.spaces (city_id);
create index spaces_created_by_idx on public.spaces (created_by);
