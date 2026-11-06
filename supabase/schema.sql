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
  avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 500),
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
  created_at  timestamptz not null default now()
);

create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.tracker_categories(id) on delete restrict,
  number        smallint not null check (number between 1 and 99),
  default_name  text not null,                      -- original client name; never editable from the app
  description   text check (description is null or char_length(description) <= 400),
  image_path    text,                               -- 'wealth-01.webp' (bundled) or full https URL (Storage)
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
