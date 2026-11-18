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
grant update (full_name, phone, avatar_url, city, profession, dream, hobbies, website) on public.profiles to authenticated;   -- never role / is_active

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
  using ((is_active and public.i_see_tracker(id)) or (select public.is_admin()));

grant select on public.activities to authenticated;
grant update (description, image_path, icon, points, is_active) on public.activities to authenticated;

drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to authenticated
  using ((is_active and public.i_see_tracker(category_id)) or (select public.is_admin()));

-- tracker assignments: members see their own, coaches see all; changes only via admin_set_tracker_member()
alter table public.tracker_assignments enable row level security;
revoke all on public.tracker_assignments from anon, authenticated;
grant select on public.tracker_assignments to authenticated;
drop policy if exists tracker_assignments_read on public.tracker_assignments;
create policy tracker_assignments_read on public.tracker_assignments for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

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

drop policy if exists activity_images_admin_select on storage.objects;
create policy activity_images_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'activity-images' and (select public.is_admin()));
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

-- =====================================================================
-- Redesign 2.1: goals, sessions, notes, doubts, to-dos
-- "me_active" = signed in AND account not paused.
-- =====================================================================
alter table public.member_goals  enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_media enable row level security;
alter table public.session_notes enable row level security;
alter table public.doubts        enable row level security;
alter table public.todos         enable row level security;
revoke all on public.member_goals, public.sessions, public.session_media, public.session_notes, public.doubts, public.todos from anon, authenticated;

-- ---------- goals: private to the member and coaches; only the member writes ----------
grant select on public.member_goals to authenticated;
grant insert (member_id, goal_year, goal_month, goal_week, net_worth, turnover, profit, problems, expectations) on public.member_goals to authenticated;
grant update (goal_year, goal_month, goal_week, net_worth, turnover, profit, problems, expectations) on public.member_goals to authenticated;
drop policy if exists goals_read on public.member_goals;
create policy goals_read on public.member_goals for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists goals_insert_own on public.member_goals;
create policy goals_insert_own on public.member_goals for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists goals_update_own on public.member_goals;
create policy goals_update_own on public.member_goals for update to authenticated
  using (member_id = (select auth.uid()) and (select public.my_role()) is not null)
  with check (member_id = (select auth.uid()));

-- ---------- sessions: every active member reads published ones; coaches manage ----------
grant select on public.sessions to authenticated;
grant insert (title, session_date, body, is_published) on public.sessions to authenticated;
grant update (title, session_date, body, is_published) on public.sessions to authenticated;
grant delete on public.sessions to authenticated;
drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions for select to authenticated
  using ((is_published and (select public.my_role()) is not null) or (select public.is_admin()));
drop policy if exists sessions_admin_insert on public.sessions;
create policy sessions_admin_insert on public.sessions for insert to authenticated with check ((select public.is_admin()));
drop policy if exists sessions_admin_update on public.sessions;
create policy sessions_admin_update on public.sessions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists sessions_admin_delete on public.sessions;
create policy sessions_admin_delete on public.sessions for delete to authenticated using ((select public.is_admin()));

grant select, delete on public.session_media to authenticated;
grant insert (session_id, kind, ref, caption, sort_order) on public.session_media to authenticated;
grant update (caption, sort_order) on public.session_media to authenticated;
drop policy if exists session_media_read on public.session_media;
create policy session_media_read on public.session_media for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id));     -- visible when its session is (sessions RLS)
drop policy if exists session_media_admin_insert on public.session_media;
create policy session_media_admin_insert on public.session_media for insert to authenticated with check ((select public.is_admin()));
drop policy if exists session_media_admin_update on public.session_media;
create policy session_media_admin_update on public.session_media for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists session_media_admin_delete on public.session_media;
create policy session_media_admin_delete on public.session_media for delete to authenticated using ((select public.is_admin()));

-- ---------- real life vs application: member writes own; coaches read ----------
grant select, delete on public.session_notes to authenticated;
grant insert (member_id, session_id, situation, application) on public.session_notes to authenticated;
grant update (session_id, situation, application) on public.session_notes to authenticated;
drop policy if exists notes_read on public.session_notes;
create policy notes_read on public.session_notes for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists notes_insert_own on public.session_notes;
create policy notes_insert_own on public.session_notes for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public.my_role()) is not null);
drop policy if exists notes_update_own on public.session_notes;
create policy notes_update_own on public.session_notes for update to authenticated
  using (member_id = (select auth.uid()) and (select public.my_role()) is not null) with check (member_id = (select auth.uid()));
drop policy if exists notes_delete_own on public.session_notes;
create policy notes_delete_own on public.session_notes for delete to authenticated
  using (member_id = (select auth.uid()) and (select public.my_role()) is not null);

-- ---------- doubts: member asks (own rows); coaches read all and answer via admin_answer_doubt() ----------
grant select, delete on public.doubts to authenticated;
grant insert (member_id, session_id, question) on public.doubts to authenticated;
drop policy if exists doubts_read on public.doubts;
create policy doubts_read on public.doubts for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists doubts_insert_own on public.doubts;
create policy doubts_insert_own on public.doubts for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public.my_role()) is not null and answer is null);
drop policy if exists doubts_delete_own_open on public.doubts;
create policy doubts_delete_own_open on public.doubts for delete to authenticated
  using (member_id = (select auth.uid()) and answered_at is null);

-- ---------- to-dos: the member only (coaches do not see them) ----------
grant select, delete on public.todos to authenticated;
grant insert (member_id, title, due_date, done_at) on public.todos to authenticated;
grant update (title, due_date, done_at) on public.todos to authenticated;
drop policy if exists todos_own on public.todos;
create policy todos_own on public.todos for all to authenticated
  using (member_id = (select auth.uid()) and (select public.my_role()) is not null)
  with check (member_id = (select auth.uid()) and (select public.my_role()) is not null);

-- ---------- private bucket for session pictures and audio ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-media', 'session-media', false, 15728640,
        array['image/webp','image/jpeg','image/png','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/webm','audio/wav','audio/x-m4a'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists session_media_obj_read on storage.objects;
create policy session_media_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'session-media' and (select public.my_role()) is not null);
drop policy if exists session_media_obj_insert on storage.objects;
create policy session_media_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'session-media' and (select public.is_admin()));
drop policy if exists session_media_obj_update on storage.objects;
create policy session_media_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'session-media' and (select public.is_admin()));
drop policy if exists session_media_obj_delete on storage.objects;
create policy session_media_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'session-media' and (select public.is_admin()));

-- ---------- phone notification subscriptions: each user manages only their own ----------
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (member_id, endpoint, p256dh, auth) on public.push_subscriptions to authenticated;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()) and (select public.my_role()) is not null);

-- ---------- Redesign 2.2 ----------
alter table public.activity_media enable row level security;
revoke all on public.activity_media from anon, authenticated;
grant select, delete on public.activity_media to authenticated;
grant insert (activity_id, kind, ref, caption, sort_order) on public.activity_media to authenticated;
grant update (caption, sort_order) on public.activity_media to authenticated;
drop policy if exists activity_media_read on public.activity_media;
create policy activity_media_read on public.activity_media for select to authenticated
  using ((select public.is_admin())
         or exists (select 1 from public.activities a where a.id = activity_id and a.is_active and public.i_see_tracker(a.category_id)));
drop policy if exists activity_media_admin_insert on public.activity_media;
create policy activity_media_admin_insert on public.activity_media for insert to authenticated with check ((select public.is_admin()));
drop policy if exists activity_media_admin_update on public.activity_media;
create policy activity_media_admin_update on public.activity_media for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists activity_media_admin_delete on public.activity_media;
create policy activity_media_admin_delete on public.activity_media for delete to authenticated using ((select public.is_admin()));

grant insert (activity_id) on public.session_notes to authenticated;
grant update (activity_id) on public.session_notes to authenticated;
grant insert (activity_id) on public.doubts to authenticated;
grant insert (image_ref) on public.session_notes to authenticated;
grant update (image_ref) on public.session_notes to authenticated;
-- a note's picture must be in the writer's own folder
drop policy if exists notes_insert_own on public.session_notes;
create policy notes_insert_own on public.session_notes for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public.my_role()) is not null
              and (image_ref is null or split_part(image_ref, '/', 1) = (select auth.uid())::text));
drop policy if exists notes_update_own on public.session_notes;
create policy notes_update_own on public.session_notes for update to authenticated
  using (member_id = (select auth.uid()) and (select public.my_role()) is not null)
  with check (member_id = (select auth.uid()) and (image_ref is null or split_part(image_ref, '/', 1) = (select auth.uid())::text));
grant insert (quadrant) on public.todos to authenticated;
grant update (quadrant) on public.todos to authenticated;

-- members' own pictures: private bucket; each member writes only <their-id>/..., reads their own; coaches read all
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-media', 'member-media', false, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists member_media_read on storage.objects;
create policy member_media_read on storage.objects for select to authenticated
  using (bucket_id = 'member-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
drop policy if exists member_media_insert on storage.objects;
create policy member_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'member-media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.my_role()) is not null);
drop policy if exists member_media_delete on storage.objects;
create policy member_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'member-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Redesign 2.3 ----------
-- program trackers marked show_locked are listed for every member (locked until opened); their habits stay hidden (see tracker_preview())
drop policy if exists categories_read on public.tracker_categories;
create policy categories_read on public.tracker_categories for select to authenticated
  using ((is_active and (show_locked or public.i_see_tracker(id))) or (select public.is_admin()));
grant insert (category_id) on public.activity_media to authenticated;
drop policy if exists activity_media_read on public.activity_media;
create policy activity_media_read on public.activity_media for select to authenticated
  using ((select public.is_admin())
         or (activity_id is not null and exists (select 1 from public.activities a where a.id = activity_id and a.is_active and public.i_see_tracker(a.category_id)))
         or (category_id is not null and public.i_see_tracker(category_id)));
update storage.buckets set allowed_mime_types = array['image/webp','image/jpeg','image/png','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/webm','audio/wav','audio/x-m4a','application/pdf'],
  file_size_limit = 26214400 where id = 'session-media';

-- ---------- Redesign 2.4: programs, batches ----------
-- Coaches only. Members see their batch through my_batches() / get_batch_leaderboard().
-- Programs, classes and batches: coaches edit directly. Batch people, finished classes and the
-- trackers a class opens change only through admin_* functions (they open trackers and notify).
alter table public.programs         enable row level security;
alter table public.program_steps    enable row level security;
alter table public.step_trackers    enable row level security;
alter table public.batches          enable row level security;
alter table public.batch_members    enable row level security;
alter table public.batch_steps_done enable row level security;
revoke all on public.programs, public.program_steps, public.step_trackers, public.batches,
              public.batch_members, public.batch_steps_done from anon, authenticated;
grant select on public.programs, public.program_steps, public.step_trackers, public.batches,
               public.batch_members, public.batch_steps_done to authenticated;
grant insert (name, kind, sort_order), update (name, kind, sort_order, is_active), delete on public.programs to authenticated;
grant insert (program_id, day_no, title), update (title), delete on public.program_steps to authenticated;
grant insert (program_id, name, starts_on), update (name, starts_on, is_active), delete on public.batches to authenticated;

drop policy if exists programs_admin on public.programs;
create policy programs_admin on public.programs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists program_steps_admin on public.program_steps;
create policy program_steps_admin on public.program_steps for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists batches_admin on public.batches;
create policy batches_admin on public.batches for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists step_trackers_admin_read on public.step_trackers;
create policy step_trackers_admin_read on public.step_trackers for select to authenticated using ((select public.is_admin()));
drop policy if exists batch_members_admin_read on public.batch_members;
create policy batch_members_admin_read on public.batch_members for select to authenticated using ((select public.is_admin()));
drop policy if exists batch_steps_done_admin_read on public.batch_steps_done;
create policy batch_steps_done_admin_read on public.batch_steps_done for select to authenticated using ((select public.is_admin()));
-- profiles.must_change (temporary password) is readable like the rest of the profile, never writable by the app
-- tracker-level notes / questions (2.4)
grant insert (category_id) on public.session_notes to authenticated;
grant update (category_id) on public.session_notes to authenticated;
grant insert (category_id) on public.doubts to authenticated;

-- to-do repeat (2.4)
grant insert (repeat), update (repeat) on public.todos to authenticated;

-- Join form (coach-only reads; writes only through the functions)
alter table public.join_requests enable row level security;
drop policy if exists join_requests_coach_read on public.join_requests;
create policy join_requests_coach_read on public.join_requests for select to authenticated using (public.is_admin());
revoke all on public.join_requests from anon, authenticated;
grant select on public.join_requests to authenticated;
