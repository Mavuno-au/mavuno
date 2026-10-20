-- The whole Data API surface, declared in one place.
--
-- Supabase projects no longer expose new tables and functions to the Data API
-- automatically, and Postgres grants EXECUTE on every new function to PUBLIC.
-- This migration first removes every privilege the API roles might have on the
-- public schema, then grants exactly what the app uses. Row level security
-- still decides which rows each person sees; these grants decide which tables,
-- columns and functions the API can reach at all.
--
-- Guests (anon) can read public content. Members (authenticated) write through
-- the policies and functions defined in earlier migrations. Internal functions
-- (publishing, notifying, purging, reputation, block lookups between two other
-- people) get no grant, so only SECURITY DEFINER code can call them.

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- Server jobs (translation cache, maintenance) use the service role, which
-- bypasses row level security and never reaches the browser.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Public reads (guests and members)
-- ---------------------------------------------------------------------------

grant select on
  public.cities,
  public.site_settings,
  public.profiles,
  public.organisation_members,
  public.follows,
  public.spaces,
  public.space_members,
  public.events,
  public.event_rsvps,
  public.opportunities,
  public.posts,
  public.post_images,
  public.polls,
  public.poll_options,
  public.likes,
  public.post_translations,
  public.post_details
to anon, authenticated;

-- post_details looks up the viewer's own vote, save and translation language.
-- Guests need the table privilege for the view to run; the policies on these
-- tables are for authenticated members only, so guests read no rows.
grant select on public.poll_votes, public.saves, public.profile_settings to anon;

-- ---------------------------------------------------------------------------
-- Members only
-- ---------------------------------------------------------------------------

grant select on
  public.profile_settings,
  public.blocks,
  public.mutes,
  public.saved_opportunities,
  public.poll_votes,
  public.saves,
  public.notifications,
  public.notification_details,
  public.conversations,
  public.conversation_participants,
  public.conversation_list,
  public.messages,
  public.message_reactions,
  public.reports,
  public.moderation_actions,
  public.review_queue,
  public.report_queue
to authenticated;

grant update (
  username, display_name, bio, avatar_url, banner_url, colour, city_id, heritage, pronouns,
  interests, languages, website, links, headline, occupation, company, industry, open_to, org_category
) on public.profiles to authenticated;

grant update (dm_policy, read_receipts, discoverable, translation_language, feed_languages_only, onboarded_at)
  on public.profile_settings to authenticated;

grant insert, delete on public.organisation_members, public.follows, public.blocks, public.mutes,
  public.space_members, public.saved_opportunities, public.likes, public.saves, public.message_reactions
to authenticated;

grant update (name, description, emoji) on public.spaces to authenticated;

grant insert, delete on public.events to authenticated;
grant update (
  title, description, category, format, starts_at, ends_at, timezone, city_id, venue_name,
  address, online_url, ticket_url, cover_url, is_free, capacity, space_id, cancelled_at
) on public.events to authenticated;

grant insert, update (status), delete on public.event_rsvps to authenticated;

grant insert, delete on public.opportunities to authenticated;
grant update (
  type, title, organisation_name, description, city_id, is_remote, location_text,
  apply_url, apply_email, deadline_at, compensation, tags, closed_at
) on public.opportunities to authenticated;

grant update (read_at) on public.notifications to authenticated;

grant update (last_read_at, archived_at, muted) on public.conversation_participants to authenticated;
grant insert (conversation_id, sender_id, body, image_paths, reply_to_id) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Helpers that row level security policies, views and storage policies call
-- while running as the requesting role. Each answers only about the viewer or
-- about public data.
grant execute on function
  public.is_moderator(),
  public.is_admin(),
  public.is_active_member(),
  public.can_act_as(uuid),
  public.can_manage_org(uuid),
  public.is_blocked_with_viewer(uuid),
  public.is_muted_by_viewer(uuid),
  public.is_space_moderator(uuid),
  public.can_see_post(uuid),
  public.is_participant(uuid),
  public.is_accepted_participant(uuid),
  public.shared_read_at(uuid, uuid),
  public.profile_colour(smallint, uuid),
  public.effective_colour(public.profiles),
  public.profile_card(uuid),
  public.in_feed(public.content_status, uuid),
  public.viewer_reads_language(text),
  public.city_distance_km(smallint, smallint),
  public.like_pattern(text),
  public.try_uuid(text),
  public.is_reserved_username(text)
to anon, authenticated;

-- Public reads.
grant execute on function
  public.feed_latest(timestamptz, integer),
  public.feed_trending(integer, integer),
  public.feed_space(uuid, timestamptz, integer),
  public.feed_topic(text, timestamptz, integer),
  public.feed_local(smallint, integer, timestamptz, integer),
  public.feed_profile(uuid, text, timestamptz, integer),
  public.post_replies(uuid, timestamptz, integer),
  public.post_ancestors(uuid),
  public.trending_topics(integer, integer),
  public.nearby_city_ids(smallint, integer),
  public.search_profiles(text, integer),
  public.search_posts(text, timestamptz, integer),
  public.count_new_posts(text, timestamptz)
to anon, authenticated;

-- Members' actions and private reads. Each function checks auth.uid() itself.
grant execute on function
  public.feed_following(timestamptz, integer),
  public.feed_saved(timestamptz, integer),
  public.suggested_profiles(integer, public.account_type),
  public.nearby_profiles(smallint, integer, text, integer),
  public.unread_notification_count(),
  public.unread_message_count(),
  public.mark_notifications_read(uuid),
  public.create_post(text, text, uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb, uuid, uuid),
  public.delete_post(uuid),
  public.restore_post(uuid),
  public.pin_post(uuid),
  public.unpin_post(uuid),
  public.vote_poll(uuid, uuid),
  public.create_organisation(text, text, text, text, smallint, text),
  public.set_organisation_role(uuid, uuid, public.org_role),
  public.delete_organisation(uuid),
  public.create_space(text, text, text, public.space_kind, smallint, text),
  public.start_direct_conversation(uuid),
  public.create_group_conversation(text, uuid[]),
  public.add_group_members(uuid, uuid[]),
  public.set_group_role(uuid, uuid, public.participant_role),
  public.remove_group_member(uuid, uuid),
  public.rename_group(uuid, text),
  public.respond_to_message_request(uuid, boolean),
  public.report_content(public.report_target, uuid, public.report_reason, text),
  public.moderate_content(public.report_target, uuid, boolean, text),
  public.moderate_approve_posts(uuid[]),
  public.moderate_dismiss_reports(public.report_target, uuid),
  public.moderate_suspend(uuid, integer, text),
  public.moderate_verify_organisation(uuid, boolean),
  public.admin_set_site_role(uuid, public.site_role),
  public.admin_update_site_settings(boolean, boolean),
  public.export_my_data(),
  public.delete_my_account()
to authenticated;

grant execute on function public.purge_deleted_posts() to service_role;
