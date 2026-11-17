-- =====================================================================
-- Deepak's Redesign Your Life — schema.sql
-- Run order: schema.sql → functions.sql → policies.sql → seed.sql
--
-- Scoring model (agreed with client, Nov 2026):
--   * A member taps ✓ Done or ✗ Not done for TODAY only.
--   * ✓ Done adds the activity's points immediately (no admin approval).
--   * ✗ Not done / unmarked = 0 points. Never negative.
--   * Past days are read-only for members.
--   * Admins can void a fake check-in; its points are removed and logged.
-- =====================================================================

-- ---------- settings ----------
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ---------- profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  phone       text check (phone is null or phone ~ '^\+?[0-9 ]{7,16}$'),
  avatar_url  text constraint profiles_avatar_url_check check (avatar_url is null or avatar_url ~ '^https://gcbizlnpryihrrmjwbdv\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'),
  role        text not null default 'member' check (role in ('super_admin','admin','member')),
  is_active   boolean not null default true,
  joined_on   date not null default ((now() at time zone 'Asia/Kolkata')::date),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles(role);

-- ---------- trackers ----------
create table if not exists public.tracker_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,30}$'),
  name        text not null,
  tagline     text,
  color       text not null default '#d9b35c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon        text,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  audience    text not null default 'all' check (audience in ('all','assigned')),  -- 'assigned' = only members the coach picks
  created_at  timestamptz not null default now()
);
alter table public.tracker_categories add column if not exists audience text not null default 'all'
  check (audience in ('all','assigned'));

-- which members get an 'assigned' tracker (e.g. Conscious Couple, a family member's own tracker)
create table if not exists public.tracker_assignments (
  category_id uuid not null references public.tracker_categories(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (category_id, member_id)
);
create index if not exists tracker_assignments_member_idx on public.tracker_assignments(member_id);
create index if not exists tracker_assignments_by_idx on public.tracker_assignments(assigned_by) where assigned_by is not null;

create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.tracker_categories(id) on delete restrict,
  number        smallint not null check (number between 1 and 99),
  default_name  text not null,                      -- original client name; never editable from the app
  description   text check (description is null or char_length(description) <= 400),
  image_path    text constraint activities_image_path_check check (image_path is null or image_path ~ '^[a-z]+-[0-9]{2}\.webp$'
                  or image_path ~ '^https://gcbizlnpryihrrmjwbdv\.supabase\.co/storage/v1/object/public/activity-images/[A-Za-z0-9._-]{1,120}$'),  -- bundled file or this project's Storage
  icon          text,
  points        smallint not null default 10 check (points between 0 and 100),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (category_id, number)
);
create index if not exists activities_category_idx on public.activities(category_id) where is_active;

-- ---------- daily check-ins ----------
create table if not exists public.daily_checkins (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles(id) on delete cascade,
  activity_id    uuid not null references public.activities(id) on delete restrict,
  checkin_date   date not null,
  status         text not null check (status in ('done','not_done')),
  note           text check (note is null or char_length(note) <= 300),
  points_awarded smallint not null default 0 check (points_awarded >= 0),
  voided_at      timestamptz,
  voided_by      uuid references public.profiles(id),
  void_reason    text check (void_reason is null or char_length(void_reason) <= 240),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, activity_id, checkin_date),               -- one entry per activity per member per day
  check ((voided_at is null) = (voided_by is null))
);
create index if not exists checkins_member_date_idx on public.daily_checkins(member_id, checkin_date desc);
create index if not exists checkins_date_idx        on public.daily_checkins(checkin_date desc);
create index if not exists checkins_done_idx        on public.daily_checkins(member_id, checkin_date) where status = 'done' and voided_at is null;
create index if not exists checkins_activity_idx    on public.daily_checkins(activity_id);
create index if not exists checkins_voided_by_idx   on public.daily_checkins(voided_by) where voided_by is not null;

-- ---------- score ledger ----------
create table if not exists public.score_history (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  checkin_id  uuid references public.daily_checkins(id) on delete cascade,
  kind        text not null check (kind in ('activity','daily_bonus','streak7_bonus','perfect_week_bonus','special_bonus')),
  points      integer not null check (points > 0),           -- ledger holds only earned points; never negative
  score_date  date not null,
  reason      text check (reason is null or char_length(reason) <= 240),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  check ((kind = 'activity') = (checkin_id is not null))
);
-- duplicate-award guards
create unique index if not exists score_one_per_checkin on public.score_history(checkin_id) where kind = 'activity';
create unique index if not exists score_one_bonus_per_day on public.score_history(member_id, kind, score_date)
  where kind in ('daily_bonus','streak7_bonus','perfect_week_bonus');
create index if not exists score_member_date_idx on public.score_history(member_id, score_date desc);
create index if not exists score_date_idx on public.score_history(score_date desc);
create index if not exists score_created_by_idx on public.score_history(created_by) where created_by is not null;

-- ---------- achievements ----------
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text not null,
  glyph       text not null,                  -- short text shown on the medal
  color_from  text not null default '#f7e5a6',
  color_to    text not null default '#9a7227',
  sort_order  smallint not null default 0
);

create table if not exists public.member_achievements (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at      timestamptz not null default now(),
  context        text,
  unique (member_id, achievement_id)
);
create index if not exists member_achievements_achievement_idx on public.member_achievements(achievement_id);

-- ---------- journal ----------
create table if not exists public.journals (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references public.profiles(id) on delete cascade,
  entry_date       date not null,
  learned          text check (learned    is null or char_length(learned)    <= 1000),
  improved         text check (improved   is null or char_length(improved)   <= 1000),
  challenges       text check (challenges is null or char_length(challenges) <= 1000),
  grateful         text check (grateful   is null or char_length(grateful)   <= 1000),
  tomorrow         text check (tomorrow   is null or char_length(tomorrow)   <= 1000),
  share_with_coach boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (member_id, entry_date)
);

-- ---------- notifications ----------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'info' check (kind in ('info','bonus','achievement','void','reminder')),
  title       text not null check (char_length(title) <= 120),
  body        text check (body is null or char_length(body) <= 500),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_member_idx on public.notifications(member_id, created_at desc);

-- ---------- audit trail ----------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_entity_idx on public.audit_logs(entity, entity_id);
create index if not exists audit_created_idx on public.audit_logs(created_at desc);

-- =====================================================================
-- Redesign 2.1 (Nov 2026): profile details, private goals, sessions,
-- doubts, to-dos. Everything below is additive; nothing above changes.
-- =====================================================================

-- ---------- profile details (shown to the member and coaches) ----------
alter table public.profiles add column if not exists city       text check (city is null or char_length(city) <= 60);
alter table public.profiles add column if not exists profession text check (profession is null or char_length(profession) <= 80);
alter table public.profiles add column if not exists dream      text check (dream is null or char_length(dream) <= 500);
alter table public.profiles add column if not exists hobbies    text check (hobbies is null or char_length(hobbies) <= 200);
alter table public.profiles add column if not exists website    text check (website is null or (char_length(website) <= 200 and website ~* '^https?://[^\s/$.?#][^\s]*$'));

-- ---------- private goals & business numbers: the member and coaches only ----------
create table if not exists public.member_goals (
  member_id     uuid primary key references public.profiles(id) on delete cascade,
  goal_year     text check (goal_year    is null or char_length(goal_year)    <= 1000),
  goal_month    text check (goal_month   is null or char_length(goal_month)   <= 1000),
  goal_week     text check (goal_week    is null or char_length(goal_week)    <= 1000),
  net_worth     text check (net_worth    is null or char_length(net_worth)    <= 60),
  turnover      text check (turnover     is null or char_length(turnover)     <= 60),
  profit        text check (profit       is null or char_length(profit)       <= 60),
  problems      text check (problems     is null or char_length(problems)     <= 1500),
  expectations  text check (expectations is null or char_length(expectations) <= 1500),
  updated_at    timestamptz not null default now()
);

-- ---------- session contents (coach posts; every active member reads) ----------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 2 and 120),
  session_date  date not null default ((now() at time zone 'Asia/Kolkata')::date),
  body          text check (body is null or char_length(body) <= 4000),          -- notes / instructions
  is_published  boolean not null default true,
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sessions_date_idx on public.sessions(session_date desc);
create index if not exists sessions_created_by_idx on public.sessions(created_by) where created_by is not null;

-- pictures and audio live in the private "session-media" bucket; videos are links (YouTube, Drive…)
create table if not exists public.session_media (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  kind        text not null check (kind in ('image','audio','video_link','link')),
  ref         text not null,
  caption     text check (caption is null or char_length(caption) <= 160),
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  check (case when kind in ('image','audio')
              then ref ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
              else char_length(ref) <= 500 and ref ~* '^https://[^\s/$.?#][^\s]*$' end)
);
create index if not exists session_media_session_idx on public.session_media(session_id, sort_order);

-- ---------- real-life situation vs application (member writes; member + coaches read) ----------
create table if not exists public.session_notes (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete set null,
  situation    text not null check (char_length(situation) between 2 and 1500),
  application  text check (application is null or char_length(application) <= 1500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists session_notes_member_idx on public.session_notes(member_id, created_at desc);
create index if not exists session_notes_session_idx on public.session_notes(session_id) where session_id is not null;

-- ---------- questions / doubts (member asks, coach answers; private to the two) ----------
create table if not exists public.doubts (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete set null,
  question     text not null check (char_length(question) between 3 and 1000),
  answer       text check (answer is null or char_length(answer) <= 2000),
  answered_by  uuid references public.profiles(id) on delete set null,
  answered_at  timestamptz,
  created_at   timestamptz not null default now(),
  check ((answer is null) = (answered_at is null))
);
create index if not exists doubts_member_idx on public.doubts(member_id, created_at desc);
create index if not exists doubts_open_idx on public.doubts(created_at desc) where answered_at is null;
create index if not exists doubts_session_idx on public.doubts(session_id) where session_id is not null;
create index if not exists doubts_answered_by_idx on public.doubts(answered_by) where answered_by is not null;

-- ---------- personal to-do list (the member only) ----------
create table if not exists public.todos (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  due_date    date,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists todos_member_idx on public.todos(member_id, done_at nulls first, due_date);

-- ---------- phone notifications (Web Push) ----------
-- One row per phone/browser that said "yes" to notifications. Keys are the browser's public
-- push keys (not secrets). The server's private VAPID key lives only in the Edge Function secrets.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique check (char_length(endpoint) <= 1000 and endpoint ~ '^https://'),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists push_subscriptions_member_idx on public.push_subscriptions(member_id);
alter table public.notifications add column if not exists pushed_at timestamptz;
create index if not exists notifications_unpushed_idx on public.notifications(created_at) where pushed_at is null;

-- =====================================================================
-- Redesign 2.2 (Nov 2026): coach opens every tracker per member, per-point
-- coach media, per-point notes/questions with member pictures, to-do quadrants.
-- =====================================================================
-- coach's explanation for one habit point: audio, pictures, video links (files in "session-media" under <activity id>/)
create table if not exists public.activity_media (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities(id) on delete cascade,
  kind         text not null check (kind in ('image','audio','video_link','link')),
  ref          text not null,
  caption      text check (caption is null or char_length(caption) <= 160),
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  check (case when kind in ('image','audio')
              then ref ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
              else char_length(ref) <= 500 and ref ~* '^https://[^\s/$.?#][^\s]*$' end)
);
create index if not exists activity_media_activity_idx on public.activity_media(activity_id, sort_order);

-- notes and questions can be about one habit point
alter table public.session_notes add column if not exists activity_id uuid references public.activities(id) on delete set null;
alter table public.doubts        add column if not exists activity_id uuid references public.activities(id) on delete set null;
create index if not exists session_notes_activity_idx on public.session_notes(activity_id) where activity_id is not null;
create index if not exists doubts_activity_idx on public.doubts(activity_id) where activity_id is not null;
-- a member's own picture with a real-life note (private bucket "member-media", folder = member id)
alter table public.session_notes add column if not exists image_ref text
  check (image_ref is null or image_ref ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$');

-- to-do priority: 1 urgent+important, 2 important not urgent, 3 urgent not important, 4 neither
alter table public.todos add column if not exists quadrant smallint not null default 2 check (quadrant between 1 and 4);

-- =====================================================================
-- Redesign 2.3 (Nov 2026): program trackers show to everyone as "locked" until the coach opens them;
-- class materials (slides as PDF, audio, links) per tracker as well as per point.
-- =====================================================================
alter table public.tracker_categories add column if not exists show_locked boolean not null default false;
alter table public.activity_media alter column activity_id drop not null;
alter table public.activity_media add column if not exists category_id uuid references public.tracker_categories(id) on delete cascade;
create index if not exists activity_media_category_idx on public.activity_media(category_id, sort_order) where category_id is not null;
alter table public.activity_media drop constraint if exists activity_media_one_target;
alter table public.activity_media add constraint activity_media_one_target check ((activity_id is null) <> (category_id is null));
-- 'file' = a PDF (e.g. the class slides) in the private session-media bucket
alter table public.activity_media drop constraint if exists activity_media_kind_check;
alter table public.activity_media add constraint activity_media_kind_check check (kind in ('image','audio','video_link','link','file'));
alter table public.activity_media drop constraint if exists activity_media_check;
alter table public.activity_media add constraint activity_media_check check (case when kind in ('image','audio','file')
  then ref ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' else char_length(ref) <= 500 and ref ~* '^https://[^\s/$.?#][^\s]*$' end);
alter table public.session_media drop constraint if exists session_media_kind_check;
alter table public.session_media add constraint session_media_kind_check check (kind in ('image','audio','video_link','link','file'));
alter table public.session_media drop constraint if exists session_media_check;
alter table public.session_media add constraint session_media_check check (case when kind in ('image','audio','file')
  then ref ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$' else char_length(ref) <= 500 and ref ~* '^https://[^\s/$.?#][^\s]*$' end);

-- =====================================================================
-- Redesign 2.4 (Nov 2026): programs (7-day online, 60-day membership, workshops), batches,
-- coach-created accounts with a first-login password change, step-by-step tracker opening.
-- =====================================================================
-- true = the member is still on the temporary password the coach gave; the app asks for a new one first
alter table public.profiles add column if not exists must_change boolean not null default false;

create table if not exists public.programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 80),
  kind        text not null default 'online' check (kind in ('online','membership','workshop')),
  is_active   boolean not null default true,
  sort_order  smallint not null default 0,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- the classes of a program in order (Day 1, Day 2 … or Class 1, Class 2 …)
create table if not exists public.program_steps (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  day_no      smallint not null check (day_no between 1 and 400),
  title       text not null check (char_length(title) between 1 and 120),
  created_at  timestamptz not null default now(),
  unique (program_id, day_no)
);

-- trackers that open for a batch when this step is marked done
create table if not exists public.step_trackers (
  step_id     uuid not null references public.program_steps(id) on delete cascade,
  category_id uuid not null references public.tracker_categories(id) on delete cascade,
  primary key (step_id, category_id)
);
create index if not exists step_trackers_category_idx on public.step_trackers(category_id);

-- one group of people going through a program together (batches can overlap)
create table if not exists public.batches (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete restrict,
  name        text not null check (char_length(name) between 2 and 80),
  starts_on   date not null default ((now() at time zone 'Asia/Kolkata')::date),
  is_active   boolean not null default true,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists batches_program_idx on public.batches(program_id);

create table if not exists public.batch_members (
  batch_id    uuid not null references public.batches(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (batch_id, member_id)
);
create index if not exists batch_members_member_idx on public.batch_members(member_id);

-- which steps a batch has finished (marking one opens its trackers for the whole batch)
create table if not exists public.batch_steps_done (
  batch_id    uuid not null references public.batches(id) on delete cascade,
  step_id     uuid not null references public.program_steps(id) on delete cascade,
  done_by     uuid references public.profiles(id) on delete set null,
  done_at     timestamptz not null default now(),
  primary key (batch_id, step_id)
);
create index if not exists batch_steps_done_step_idx on public.batch_steps_done(step_id);

-- 2.4: notes and questions can be about a whole tracker (one "Notes · Audio · Ask" sheet per tracker)
alter table public.session_notes add column if not exists category_id uuid references public.tracker_categories(id) on delete set null;
alter table public.doubts        add column if not exists category_id uuid references public.tracker_categories(id) on delete set null;
create index if not exists session_notes_category_idx on public.session_notes(category_id) where category_id is not null;
create index if not exists doubts_category_idx on public.doubts(category_id) where category_id is not null;

-- to-do repeat (2.4): daily / weekdays / weekly / monthly. Ticking one makes the next copy; unticking removes it again.
alter table public.todos add column if not exists repeat text check (repeat in ('daily','weekdays','weekly','monthly'));
alter table public.todos add column if not exists repeat_of uuid references public.todos(id) on delete set null;
create index if not exists todos_repeat_of_idx on public.todos(repeat_of) where repeat_of is not null;

-- Membership dates: when a member joined the paid membership and when it renews (coach-only).
alter table public.profiles add column if not exists member_since date;
alter table public.profiles add column if not exists renews_on date;
alter table public.profiles drop constraint if exists profiles_renews_after_join;
alter table public.profiles add constraint profiles_renews_after_join check (renews_on is null or member_since is null or renews_on >= member_since);
