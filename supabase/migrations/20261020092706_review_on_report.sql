-- Moderation starts with reports: new members' posts, events and opportunities
-- go public straight away. Someone with a report in the past week that wasn't
-- dismissed still waits for review (has_good_reputation), and admins can turn
-- the review of new members back on from Moderation → Admin, for example
-- during a wave of spam.
alter table public.site_settings alter column premoderation set default false;
update public.site_settings set premoderation = false, updated_at = now();
