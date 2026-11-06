-- =====================================================================
-- Deepak's Redesign Your Life — policies.sql  (run after functions.sql)
-- Row Level Security on every table + column-level grants.
-- Members never write check-ins or scores directly: only through
-- mark_activity() and the admin_* functions.
-- =====================================================================

alter table public.app_settings        enable row level security;
alter table public.profiles            enable row level security;
alter table public.tracker_categories  enable row level security;
alter table public.activities          enable row level security;
alter table public.daily_checkins      enable row level security;
alter table public.score_history       enable row level security;
alter table public.achievements        enable row level security;
alter table public.member_achievements enable row level security;
alter table public.journals            enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_logs          enable row level security;

-- Start from zero, then grant only what the app needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- app_settings: read-only for signed-in users ----------
grant select on public.app_settings to authenticated;
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (true);

-- ---------- profiles ----------
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;   -- never role / is_active

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active)
  with check (id = (select auth.uid()));

-- ---------- trackers & activities ----------
grant select on public.tracker_categories to authenticated;
drop policy if exists categories_read on public.tracker_categories;
create policy categories_read on public.tracker_categories for select to authenticated
  using (is_active or (select public.is_admin()));

grant select on public.activities to authenticated;
grant update (description, image_path, icon, points, is_active) on public.activities to authenticated;

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to authenticated
  using (is_active or (select public.is_admin()));

drop policy if exists activities_admin_update on public.activities;
create policy activities_admin_update on public.activities for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- check-ins & scores: read own, coaches read all ----------
grant select on public.daily_checkins to authenticated;
drop policy if exists checkins_read on public.daily_checkins;
create policy checkins_read on public.daily_checkins for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.score_history to authenticated;
drop policy if exists scores_read on public.score_history;
create policy scores_read on public.score_history for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

-- ---------- achievements ----------
grant select on public.achievements to authenticated;
drop policy if exists achievements_read on public.achievements;
create policy achievements_read on public.achievements for select to authenticated using (true);

grant select on public.member_achievements to authenticated;
drop policy if exists member_achievements_read on public.member_achievements;
create policy member_achievements_read on public.member_achievements for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

-- ---------- journal: private; coach sees it only when the member shares ----------
grant select, insert, delete on public.journals to authenticated;
grant update (learned, improved, challenges, grateful, tomorrow, share_with_coach) on public.journals to authenticated;

drop policy if exists journals_read on public.journals;
create policy journals_read on public.journals for select to authenticated
  using (member_id = (select auth.uid()) or (share_with_coach and (select public.is_admin())));

drop policy if exists journals_insert on public.journals;
create policy journals_insert on public.journals for insert to authenticated
  with check (member_id = (select auth.uid())
              and entry_date between (select public.app_today()) - 1 and (select public.app_today()));

drop policy if exists journals_update on public.journals;
create policy journals_update on public.journals for update to authenticated
  using (member_id = (select auth.uid()) and entry_date >= (select public.app_today()) - 1)
  with check (member_id = (select auth.uid()));

drop policy if exists journals_delete on public.journals;
create policy journals_delete on public.journals for delete to authenticated
  using (member_id = (select auth.uid()));

-- ---------- notifications: own only; may only mark as read ----------
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (member_id = (select auth.uid()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (member_id = (select auth.uid()));

-- ---------- audit log: coaches read, nobody writes directly ----------
grant select on public.audit_logs to authenticated;
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

-- =====================================================================
-- Storage buckets
--   activity-images : public read, coaches upload/replace
--   avatars         : public read, each user writes only <their-id>/...
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-images', 'activity-images', true, 524288, array['image/webp','image/jpeg','image/png']),
       ('avatars',         'avatars',         true, 262144, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists activity_images_admin_insert on storage.objects;
create policy activity_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-images' and (select public.is_admin()));
drop policy if exists activity_images_admin_update on storage.objects;
create policy activity_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'activity-images' and (select public.is_admin()));
drop policy if exists activity_images_admin_delete on storage.objects;
create policy activity_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'activity-images' and (select public.is_admin()));

drop policy if exists avatars_own_insert on storage.objects;
create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
