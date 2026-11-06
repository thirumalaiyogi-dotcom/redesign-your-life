-- =====================================================================
-- Deepak's Redesign Your Life — COMPLETE SETUP (Phase 2)
-- Paste this whole file into Supabase → SQL Editor → Run.
-- It is the four files below in order. Safe to run again.
-- =====================================================================

-- >>>>>>>>>>>>>>>>>>>> schema.sql
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
  created_at  timestamptz not null default now()
);

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

-- >>>>>>>>>>>>>>>>>>>> functions.sql
-- =====================================================================
-- Deepak's Redesign Your Life — functions.sql  (run after schema.sql)
-- Every SECURITY DEFINER function pins search_path = '' and qualifies
-- every object, and each one checks the caller's role itself.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------
create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::int from public.app_settings s where s.key = p_key), p_default);
$$;

create or replace function public.app_today()
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
            (select s.value #>> '{}' from public.app_settings s where s.key = 'timezone'),
            'Asia/Kolkata'))::date;
$$;

-- role of the signed-in user, or null if not signed in / inactive
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('admin','super_admin'), false);
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'super_admin', false);
$$;

create or replace function public._audit(p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public._notify(p_member uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(member_id, kind, title, body) values (p_member, p_kind, p_title, p_body);
$$;

-- number of activities that currently count (active activity in an active tracker)
create or replace function public._total_active(p_category uuid default null)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.activities a join public.tracker_categories c on c.id = a.category_id
  where a.is_active and c.is_active and (p_category is null or a.category_id = p_category);
$$;

-- done (and not voided) check-ins of one member on one day, active activities only
create or replace function public._done_on(p_member uuid, p_day date, p_category uuid default null)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.daily_checkins d
  join public.activities a on a.id = d.activity_id
  join public.tracker_categories c on c.id = a.category_id
  where d.member_id = p_member and d.checkin_date = p_day
    and d.status = 'done' and d.voided_at is null
    and a.is_active and c.is_active
    and (p_category is null or a.category_id = p_category);
$$;

-- consecutive days ending exactly on p_as_of with >= streak_min_daily done
create or replace function public._streak(p_member uuid, p_as_of date)
returns int language sql stable security definer set search_path = '' as $$
  with days as (
    select d.checkin_date as day
    from public.daily_checkins d
    where d.member_id = p_member and d.status = 'done' and d.voided_at is null and d.checkin_date <= p_as_of
    group by d.checkin_date
    having count(*) >= public.setting_int('streak_min_daily', 1)
  ), n as (select day, row_number() over (order by day desc) as rn from days)
  select count(*)::int from n where p_as_of - day = rn - 1;
$$;

-- streak shown in the app: today's run, or yesterday's if today is not ticked yet
create or replace function public._display_streak(p_member uuid, p_as_of date)
returns int language sql stable security definer set search_path = '' as $$
  select greatest(public._streak(p_member, p_as_of), public._streak(p_member, p_as_of - 1));
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists activities_touch on public.activities;
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();
drop trigger if exists checkins_touch on public.daily_checkins;
create trigger checkins_touch before update on public.daily_checkins for each row execute function public.touch_updated_at();
drop trigger if exists journals_touch on public.journals;
create trigger journals_touch before update on public.journals for each row execute function public.touch_updated_at();

-- every new auth user gets a member profile; role can only be raised by a super admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_phone text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9+ ]', '', 'g'), '');
begin
  if v_phone is not null and v_phone !~ '^\+?[0-9 ]{7,16}$' then v_phone := null; end if;
  insert into public.profiles(id, full_name, phone)
  values (new.id, left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 80), v_phone)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- default_name is the client's original wording: block any change, even by admins
create or replace function public.guard_activity_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.default_name is distinct from old.default_name
     or new.category_id is distinct from old.category_id
     or new.number is distinct from old.number then
    raise exception 'Activity names and numbers are fixed. You can change the description, image, points and visibility.'
      using errcode = '42501';
  end if;
  perform public._audit('activity.update', 'activities', new.id::text, jsonb_build_object(
    'description', jsonb_build_array(old.description, new.description),
    'image_path',  jsonb_build_array(old.image_path,  new.image_path),
    'points',      jsonb_build_array(old.points,      new.points),
    'is_active',   jsonb_build_array(old.is_active,   new.is_active)));
  return new;
end; $$;

drop trigger if exists activities_guard on public.activities;
create trigger activities_guard before update on public.activities for each row execute function public.guard_activity_update();

-- ---------------------------------------------------------------------
-- Bonuses and achievements (internal; not callable from the app)
-- ---------------------------------------------------------------------
create or replace function public._recalc_bonuses(p_member uuid, p_day date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_total  int := public._total_active();
  v_streak int;
  v_pts    int;
  v_perfect boolean;
begin
  delete from public.score_history
   where member_id = p_member and score_date = p_day
     and kind in ('daily_bonus','streak7_bonus','perfect_week_bonus');

  -- all activities done today
  v_pts := public.setting_int('daily_completion_bonus', 20);
  if v_total > 0 and v_pts > 0 and public._done_on(p_member, p_day) >= v_total then
    insert into public.score_history(member_id, kind, points, score_date, reason)
    values (p_member, 'daily_bonus', v_pts, p_day, 'All activities completed');
  end if;

  -- every 7th day of an unbroken streak
  v_pts := public.setting_int('streak7_bonus', 30);
  v_streak := public._streak(p_member, p_day);
  if v_pts > 0 and v_streak > 0 and v_streak % 7 = 0 then
    insert into public.score_history(member_id, kind, points, score_date, reason)
    values (p_member, 'streak7_bonus', v_pts, p_day, v_streak || '-day streak');
  end if;

  -- Sunday closes a week where every activity was done every day
  v_pts := public.setting_int('perfect_week_bonus', 50);
  if v_pts > 0 and v_total > 0 and extract(isodow from p_day) = 7 then
    select bool_and(public._done_on(p_member, g::date) >= v_total) into v_perfect
    from generate_series(p_day - 6, p_day, interval '1 day') g;
    if v_perfect then
      insert into public.score_history(member_id, kind, points, score_date, reason)
      values (p_member, 'perfect_week_bonus', v_pts, p_day, 'Perfect week');
    end if;
  end if;
end; $$;

create or replace function public._award(p_member uuid, p_code text, p_context text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text; v_new uuid;
begin
  select id, name into v_id, v_name from public.achievements where code = p_code;
  if v_id is null then return; end if;
  insert into public.member_achievements(member_id, achievement_id, context)
  values (p_member, v_id, p_context)
  on conflict (member_id, achievement_id) do nothing
  returning id into v_new;
  if v_new is not null then
    perform public._notify(p_member, 'achievement', 'New badge: ' || v_name, p_context);
  end if;
end; $$;

create or replace function public._evaluate_achievements(p_member uuid, p_day date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_streak int := public._streak(p_member, p_day); r record; v_days int;
begin
  if exists (select 1 from public.daily_checkins where member_id = p_member and status = 'done' and voided_at is null) then
    perform public._award(p_member, 'first_activity', 'First habit ticked');
  end if;
  if v_streak >= 7  then perform public._award(p_member, 'streak_7',          '7 days in a row');  end if;
  if v_streak >= 30 then perform public._award(p_member, 'consistency_30',    '30 days in a row'); end if;
  if v_streak >= 60 then perform public._award(p_member, 'transformation_60', '60 days in a row'); end if;
  if v_streak >= 90 then perform public._award(p_member, 'champion_90',       '90 days in a row'); end if;
  if exists (select 1 from public.score_history where member_id = p_member and kind = 'perfect_week_bonus') then
    perform public._award(p_member, 'perfect_week', 'Every habit, every day, for a week');
  end if;
  -- tracker masters: full tracker completed on 7 different days
  for r in select c.id, c.slug from public.tracker_categories c
           where c.slug in ('wealth','karma','champion') and c.is_active loop
    select count(*) into v_days from (
      select d.checkin_date
      from public.daily_checkins d join public.activities a on a.id = d.activity_id
      where d.member_id = p_member and a.category_id = r.id and a.is_active
        and d.status = 'done' and d.voided_at is null
      group by d.checkin_date
      having count(*) >= public._total_active(r.id)) x;
    if v_days >= 7 then
      perform public._award(p_member,
        case r.slug when 'wealth' then 'wealth_master' when 'karma' then 'karma_star' else 'champion_mindset' end,
        'Full tracker completed on 7 days');
    end if;
  end loop;
end; $$;

-- ---------------------------------------------------------------------
-- MEMBER: mark today's activity  (✓ done / ✗ not done / clear)
-- ---------------------------------------------------------------------
create or replace function public.mark_activity(p_activity_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := public.app_today();
  v_act   record;
  v_row   public.daily_checkins;
  v_note  text := nullif(left(trim(coalesce(p_note, '')), 300), '');
begin
  if v_uid is null or public.my_role() is null then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('done','not_done') then
    raise exception 'Status must be done, not_done or empty.' using errcode = '22023';
  end if;

  select a.id, a.points, a.default_name into v_act
  from public.activities a join public.tracker_categories c on c.id = a.category_id
  where a.id = p_activity_id and a.is_active and c.is_active;
  if not found then raise exception 'This activity is not available.' using errcode = 'P0002'; end if;

  select * into v_row from public.daily_checkins
  where member_id = v_uid and activity_id = p_activity_id and checkin_date = v_today
  for update;

  if found and v_row.voided_at is not null then
    raise exception 'Your coach removed today''s entry for this activity: %', coalesce(v_row.void_reason, 'no reason given')
      using errcode = '42501';
  end if;

  if p_status is null then                               -- clear
    if found then delete from public.daily_checkins where id = v_row.id; end if;   -- score row cascades
  else
    insert into public.daily_checkins(member_id, activity_id, checkin_date, status, note, points_awarded)
    values (v_uid, p_activity_id, v_today, p_status, v_note,
            case when p_status = 'done' then v_act.points else 0 end)
    on conflict (member_id, activity_id, checkin_date) do update
      set status = excluded.status, note = coalesce(excluded.note, public.daily_checkins.note),
          points_awarded = excluded.points_awarded
    returning * into v_row;

    if p_status = 'done' and v_act.points > 0 then
      insert into public.score_history(member_id, checkin_id, kind, points, score_date, reason)
      values (v_uid, v_row.id, 'activity', v_act.points, v_today, v_act.default_name)
      on conflict (checkin_id) where kind = 'activity' do nothing;
    else
      delete from public.score_history where checkin_id = v_row.id and kind = 'activity';
    end if;
  end if;

  perform public._recalc_bonuses(v_uid, v_today);
  perform public._evaluate_achievements(v_uid, v_today);
  perform public._audit('checkin.mark', 'activities', p_activity_id::text,
                        jsonb_build_object('status', p_status, 'date', v_today));

  return jsonb_build_object(
    'status',       p_status,
    'date',         v_today,
    'points_today', (select coalesce(sum(points), 0) from public.score_history where member_id = v_uid and score_date = v_today),
    'total_points', (select coalesce(sum(points), 0) from public.score_history where member_id = v_uid),
    'done_today',   public._done_on(v_uid, v_today),
    'streak',       public._display_streak(v_uid, v_today));
end; $$;

-- ---------------------------------------------------------------------
-- MEMBER: dashboard summary
-- ---------------------------------------------------------------------
create or replace function public.get_my_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := public.app_today();
  v_week date := date_trunc('week', public.app_today())::date;
  v_month date := date_trunc('month', public.app_today())::date;
  v_total int := public._total_active();
  v_joined date;
  v_wdays int; v_mdays int;
  v_rank record;
begin
  select joined_on into v_joined from public.profiles where id = v_uid and is_active;
  if v_uid is null or v_joined is null then raise exception 'Please log in again.' using errcode = '42501'; end if;
  v_wdays := v_today - greatest(v_week,  v_joined) + 1;
  v_mdays := v_today - greatest(v_month, v_joined) + 1;
  select l.rank, l.movement into v_rank from public.get_leaderboard('all_time') l where l.is_me;

  return jsonb_build_object(
    'today', v_today,
    'total_points', (select coalesce(sum(points),0) from public.score_history where member_id = v_uid),
    'today_points', (select coalesce(sum(points),0) from public.score_history where member_id = v_uid and score_date = v_today),
    'rank', v_rank.rank, 'rank_movement', v_rank.movement,
    'streak', public._display_streak(v_uid, v_today),
    'total_activities', v_total,
    'done_today', public._done_on(v_uid, v_today),
    'done_month', (select count(*) from public.daily_checkins where member_id = v_uid and status='done' and voided_at is null and checkin_date >= v_month),
    'weekly_pct', case when v_total = 0 or v_wdays <= 0 then 0 else round(100.0 *
        (select count(*) from public.daily_checkins where member_id = v_uid and status='done' and voided_at is null and checkin_date >= v_week)
        / (v_total * v_wdays)) end,
    'monthly_pct', case when v_total = 0 or v_mdays <= 0 then 0 else round(100.0 *
        (select count(*) from public.daily_checkins where member_id = v_uid and status='done' and voided_at is null and checkin_date >= v_month)
        / (v_total * v_mdays)) end,
    'missed_week', greatest(0, v_total * greatest(v_wdays - 1, 0) -
        (select count(*) from public.daily_checkins where member_id = v_uid and status='done' and voided_at is null
          and checkin_date >= greatest(v_week, v_joined) and checkin_date < v_today)),
    'trackers', (select coalesce(jsonb_agg(jsonb_build_object(
          'slug', c.slug, 'name', c.name, 'total', public._total_active(c.id),
          'done_today', public._done_on(v_uid, v_today, c.id),
          'not_done_today', (select count(*) from public.daily_checkins d join public.activities a on a.id = d.activity_id
                             where d.member_id = v_uid and d.checkin_date = v_today and d.status = 'not_done' and a.category_id = c.id))
        order by c.sort_order), '[]'::jsonb)
        from public.tracker_categories c where c.is_active),
    'badges', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'glyph', a.glyph,
                 'color_from', a.color_from, 'color_to', a.color_to, 'earned_at', m.earned_at) order by a.sort_order), '[]'::jsonb)
               from public.achievements a left join public.member_achievements m on m.achievement_id = a.id and m.member_id = v_uid));
end; $$;

-- ---------------------------------------------------------------------
-- LEADERBOARD
-- ---------------------------------------------------------------------
create or replace function public._period_stats(p_start date, p_end date)
returns table(member_id uuid, points bigint, activities_done bigint, active_days bigint, consistency numeric, last_score_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with m as (select id, joined_on from public.profiles where is_active and role = 'member'),
  pts as (select s.member_id, sum(s.points) as pts, max(s.created_at) as last_at
          from public.score_history s where s.score_date between p_start and p_end group by s.member_id),
  daily as (select d.member_id, d.checkin_date, count(*) as n
            from public.daily_checkins d
            where d.status = 'done' and d.voided_at is null and d.checkin_date between p_start and p_end
            group by d.member_id, d.checkin_date),
  agg as (select daily.member_id, sum(n) as done,
                 count(*) filter (where n >= public.setting_int('streak_min_daily', 1)) as days
          from daily group by daily.member_id)
  select m.id,
         coalesce(pts.pts, 0)::bigint,
         coalesce(agg.done, 0)::bigint,
         coalesce(agg.days, 0)::bigint,
         case when p_end < greatest(p_start, m.joined_on) then 0
              else round(100.0 * coalesce(agg.days, 0) / (p_end - greatest(p_start, m.joined_on) + 1), 1) end,
         pts.last_at
  from m left join pts on pts.member_id = m.id left join agg on agg.member_id = m.id;
$$;

-- Ranking order (fair tie-break): points ↓, consistency ↓, current streak ↓,
-- whoever reached the score first ↑, then name.
create or replace function public.get_leaderboard(p_period text default 'weekly', p_date date default null)
returns table(rank int, member_id uuid, full_name text, avatar_url text, points bigint, activities_done bigint,
              consistency numeric, streak int, prev_rank int, movement int, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare d date := coalesce(p_date, public.app_today()); s date; e date; ps date; pe date;
begin
  if auth.uid() is null or public.my_role() is null then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  case p_period
    when 'daily'    then s := d; e := d; ps := d - 1; pe := d - 1;
    when 'weekly'   then s := date_trunc('week', d)::date; e := d; ps := s - 7; pe := s - 1;
    when 'monthly'  then s := date_trunc('month', d)::date; e := d; ps := (s - interval '1 month')::date; pe := s - 1;
    when 'all_time' then s := date '2000-01-01'; e := d; ps := s; pe := d - 1;
    else raise exception 'Unknown period: %', p_period using errcode = '22023';
  end case;

  return query
  with cur as (
    select st.*, public._display_streak(st.member_id, d) as stk, p.full_name as nm, p.avatar_url as av
    from public._period_stats(s, e) st join public.profiles p on p.id = st.member_id),
  cr as (
    select cur.*, row_number() over (order by cur.points desc, cur.consistency desc, cur.stk desc,
                                     cur.last_score_at asc nulls last, cur.nm, cur.member_id)::int as rk
    from cur),
  pr as (
    select pp.member_id, row_number() over (order by pp.points desc, pp.consistency desc,
                                            pp.last_score_at asc nulls last, pp.member_id)::int as rk
    from public._period_stats(ps, pe) pp
    where pp.points > 0)                       -- movement only against a period where they scored
  select cr.rk, cr.member_id, cr.nm, cr.av, cr.points, cr.activities_done, cr.consistency, cr.stk,
         pr.rk, coalesce(pr.rk - cr.rk, 0), cr.member_id = auth.uid()
  from cr left join pr on pr.member_id = cr.member_id
  order by cr.rk;
end; $$;

create or replace function public.get_recognitions(p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d date := coalesce(p_date, public.app_today()); v jsonb := '{}'::jsonb; r record;
begin
  if auth.uid() is null or public.my_role() is null then raise exception 'Please log in again.' using errcode = '42501'; end if;

  select l.full_name, l.points into r from public.get_leaderboard('daily', d) l where l.points > 0 order by l.rank limit 1;
  if found then v := v || jsonb_build_object('champion_of_day', jsonb_build_object('name', r.full_name, 'detail', r.points || ' pts today')); end if;

  select l.full_name, l.consistency into r from public.get_leaderboard('weekly', d) l where l.activities_done > 0
    order by l.consistency desc, l.points desc limit 1;
  if found then v := v || jsonb_build_object('most_consistent', jsonb_build_object('name', r.full_name, 'detail', round(r.consistency)::int || '% this week')); end if;

  select l.full_name, l.movement into r from public.get_leaderboard('weekly', d) l where l.movement > 0
    order by l.movement desc, l.rank limit 1;
  if found then v := v || jsonb_build_object('best_improvement', jsonb_build_object('name', r.full_name, 'detail', 'Up ' || r.movement || ' places')); end if;

  select l.full_name, l.streak into r from public.get_leaderboard('all_time', d) l where l.streak > 0
    order by l.streak desc, l.rank limit 1;
  if found then v := v || jsonb_build_object('max_streak', jsonb_build_object('name', r.full_name, 'detail', r.streak || case when r.streak = 1 then ' day' else ' days' end)); end if;

  select l.full_name, l.points into r
  from public.get_leaderboard('monthly', (date_trunc('month', d) - interval '1 day')::date) l
  where l.points > 0 order by l.rank limit 1;
  if found then v := v || jsonb_build_object('monthly_champion', jsonb_build_object('name', r.full_name,
                    'detail', to_char(date_trunc('month', d) - interval '1 day', 'FMMonth YYYY'))); end if;
  return v;
end; $$;

-- ---------------------------------------------------------------------
-- ADMIN actions
-- ---------------------------------------------------------------------
create or replace function public.admin_void_checkin(p_checkin_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row public.daily_checkins; v_reason text := nullif(left(trim(coalesce(p_reason,'')), 240), ''); d date;
begin
  if not public.is_admin() then raise exception 'Only coaches can remove entries.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Give a reason of at least 5 characters. The member will see it.' using errcode = '22023';
  end if;
  select * into v_row from public.daily_checkins where id = p_checkin_id for update;
  if not found then raise exception 'Entry not found.' using errcode = 'P0002'; end if;
  if v_row.voided_at is not null then return; end if;            -- already voided: no-op

  update public.daily_checkins
     set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, points_awarded = 0
   where id = p_checkin_id;
  delete from public.score_history where checkin_id = p_checkin_id and kind = 'activity';

  -- later streak/week bonuses may depend on this day
  for d in select g::date from generate_series(v_row.checkin_date, least(public.app_today(), v_row.checkin_date + 60), interval '1 day') g loop
    perform public._recalc_bonuses(v_row.member_id, d);
  end loop;

  perform public._notify(v_row.member_id, 'void', 'An entry was removed by your coach', v_reason);
  perform public._audit('checkin.void', 'daily_checkins', p_checkin_id::text,
                        jsonb_build_object('member', v_row.member_id, 'date', v_row.checkin_date, 'reason', v_reason));
end; $$;

create or replace function public.admin_award_bonus(p_member uuid, p_points int, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_reason text := nullif(left(trim(coalesce(p_reason,'')), 240), '');
begin
  if not public.is_admin() then raise exception 'Only coaches can give bonus points.' using errcode = '42501'; end if;
  if p_points is null or p_points < 1 or p_points > 500 then raise exception 'Bonus must be between 1 and 500 points.' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'Add a reason for the bonus.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_member and is_active and role = 'member') then
    raise exception 'Member not found or inactive.' using errcode = 'P0002';
  end if;
  insert into public.score_history(member_id, kind, points, score_date, reason, created_by)
  values (p_member, 'special_bonus', p_points, public.app_today(), v_reason, auth.uid())
  returning id into v_id;
  perform public._notify(p_member, 'bonus', '+' || p_points || ' bonus points from your coach', v_reason);
  perform public._audit('score.bonus', 'score_history', v_id::text, jsonb_build_object('member', p_member, 'points', p_points, 'reason', v_reason));
  return v_id;
end; $$;

create or replace function public.admin_set_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not public.is_super_admin() then raise exception 'Only the super admin can change roles.' using errcode = '42501'; end if;
  if p_role not in ('super_admin','admin','member') then raise exception 'Unknown role.' using errcode = '22023'; end if;
  if p_member = auth.uid() then raise exception 'You cannot change your own role.' using errcode = '42501'; end if;
  select role into v_old from public.profiles where id = p_member for update;
  if not found then raise exception 'Member not found.' using errcode = 'P0002'; end if;
  update public.profiles set role = p_role where id = p_member;
  perform public._audit('profile.role', 'profiles', p_member::text, jsonb_build_object('from', v_old, 'to', p_role));
end; $$;

create or replace function public.admin_set_active(p_member uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if not public.is_admin() then raise exception 'Only coaches can change member status.' using errcode = '42501'; end if;
  if p_member = auth.uid() then raise exception 'You cannot deactivate yourself.' using errcode = '42501'; end if;
  select role into v_role from public.profiles where id = p_member for update;
  if not found then raise exception 'Member not found.' using errcode = 'P0002'; end if;
  if v_role <> 'member' and not public.is_super_admin() then
    raise exception 'Only the super admin can change another coach.' using errcode = '42501';
  end if;
  update public.profiles set is_active = coalesce(p_active, true) where id = p_member;
  perform public._audit('profile.active', 'profiles', p_member::text, jsonb_build_object('active', p_active));
end; $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old jsonb;
begin
  if not public.is_super_admin() then raise exception 'Only the super admin can change settings.' using errcode = '42501'; end if;
  select value into v_old from public.app_settings where key = p_key for update;
  if not found then raise exception 'Unknown setting: %', p_key using errcode = 'P0002'; end if;
  if p_key in ('daily_completion_bonus','streak7_bonus','perfect_week_bonus','streak_min_daily')
     and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 0 and 500) then
    raise exception 'Points must be a number between 0 and 500.' using errcode = '22023';
  end if;
  update public.app_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform public._audit('settings.update', 'app_settings', p_key, jsonb_build_object('from', v_old, 'to', p_value));
end; $$;

-- award "Monthly Champion" to last month's #1 (safe to run more than once)
create or replace function public.admin_close_month(p_month date)
returns text language plpgsql security definer set search_path = '' as $$
declare r record; v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not public.is_admin() then raise exception 'Only coaches can close a month.' using errcode = '42501'; end if;
  if v_end >= public.app_today() then raise exception 'That month has not finished yet.' using errcode = '22023'; end if;
  select l.member_id, l.full_name, l.points into r from public.get_leaderboard('monthly', v_end) l where l.points > 0 order by l.rank limit 1;
  if not found then return 'No points were scored that month.'; end if;
  perform public._award(r.member_id, 'monthly_champion', to_char(v_end, 'FMMonth YYYY'));
  perform public._audit('month.close', 'achievements', to_char(v_end, 'YYYY-MM'), jsonb_build_object('winner', r.member_id, 'points', r.points));
  return r.full_name || ' is Monthly Champion for ' || to_char(v_end, 'FMMonth YYYY');
end; $$;

-- ---------------------------------------------------------------------
-- ADMIN reports
-- ---------------------------------------------------------------------
create or replace function public.admin_overview(p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d date := coalesce(p_date, public.app_today()); w date := date_trunc('week', coalesce(p_date, public.app_today()))::date;
        v_members int; v_active int; v_total int := public._total_active();
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  select count(*) into v_members from public.profiles where role = 'member' and is_active;
  select count(distinct member_id) into v_active from public.daily_checkins where checkin_date = d;
  return jsonb_build_object(
    'date', d,
    'total_members', v_members,
    'active_today', v_active,
    'inactive_today', greatest(v_members - v_active, 0),
    'ticks_today', (select count(*) from public.daily_checkins where checkin_date = d and status = 'done' and voided_at is null),
    'points_week', (select coalesce(sum(points),0) from public.score_history where score_date between w and d),
    'avg_completion_week', case when v_members = 0 or v_total = 0 then 0 else round(100.0 *
        (select count(*) from public.daily_checkins c join public.profiles p on p.id = c.member_id
          where p.role = 'member' and p.is_active and c.checkin_date between w and d and c.status = 'done' and c.voided_at is null)
        / (v_members * v_total * (d - w + 1))) end,
    'category_week', (select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'pct',
        case when v_members = 0 or public._total_active(c.id) = 0 then 0 else round(100.0 *
          (select count(*) from public.daily_checkins x join public.activities a on a.id = x.activity_id
            where a.category_id = c.id and x.checkin_date between w and d and x.status = 'done' and x.voided_at is null)
          / (v_members * public._total_active(c.id) * (d - w + 1))) end) order by c.sort_order), '[]'::jsonb)
        from public.tracker_categories c where c.is_active),
    'daily_active', (select jsonb_agg(jsonb_build_object('date', g::date,
        'members', (select count(distinct member_id) from public.daily_checkins where checkin_date = g::date)) order by g)
        from generate_series(d - 13, d, interval '1 day') g),
    'recent', (select coalesce(jsonb_agg(x order by x.at desc), '[]'::jsonb) from (
        select c.id, p.full_name as member, a.default_name as activity, t.slug as tracker, c.status,
               c.checkin_date as date, c.updated_at as at, c.voided_at is not null as voided
        from public.daily_checkins c join public.profiles p on p.id = c.member_id
        join public.activities a on a.id = c.activity_id join public.tracker_categories t on t.id = a.category_id
        order by c.updated_at desc limit 20) x));
end; $$;

create or replace function public.admin_member_report(p_start date, p_end date)
returns table(member_id uuid, full_name text, email text, phone text, joined_on date, is_active boolean,
              points bigint, activities_done bigint, active_days bigint, consistency numeric, streak int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Choose a date range of up to 400 days.' using errcode = '22023';
  end if;
  return query
  select p.id, p.full_name, u.email::text, p.phone, p.joined_on, p.is_active,
         coalesce(st.points, 0), coalesce(st.activities_done, 0), coalesce(st.active_days, 0),
         coalesce(st.consistency, 0), public._display_streak(p.id, p_end)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public._period_stats(p_start, p_end) st on st.member_id = p.id
  where p.role = 'member'
  order by coalesce(st.points, 0) desc, p.full_name;
end; $$;

-- everyone (members, coaches, super admins) for the role-management screen
create or replace function public.admin_list_people()
returns table(id uuid, full_name text, email text, phone text, role text, is_active boolean,
              joined_on date, last_sign_in_at timestamptz, email_confirmed boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, u.email::text, p.phone, p.role, p.is_active, p.joined_on,
         u.last_sign_in_at, u.email_confirmed_at is not null
  from public.profiles p join auth.users u on u.id = p.id
  order by case p.role when 'super_admin' then 0 when 'admin' then 1 else 2 end, p.full_name;
end; $$;

-- Coach check-in feed (server-side filtering, coaches only)
create or replace function public.admin_checkins(
  p_date date default null, p_tracker text default null, p_status text default null,
  p_search text default null, p_limit int default 200)
returns table(id uuid, checkin_date date, status text, note text, points_awarded smallint,
              voided_at timestamptz, void_reason text, voided_by_name text, updated_at timestamptz,
              member_id uuid, member_name text, activity_number smallint, activity_name text, tracker_slug text, tracker_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare d date := coalesce(p_date, public.app_today()); q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('done','not_done','removed') then
    raise exception 'Unknown status filter.' using errcode = '22023';
  end if;
  return query
  select c.id, c.checkin_date, c.status, c.note, c.points_awarded, c.voided_at, c.void_reason, vb.full_name,
         c.updated_at, p.id, p.full_name, a.number, a.default_name, t.slug, t.name
  from public.daily_checkins c
  join public.profiles p on p.id = c.member_id
  join public.activities a on a.id = c.activity_id
  join public.tracker_categories t on t.id = a.category_id
  left join public.profiles vb on vb.id = c.voided_by
  where c.checkin_date = d
    and (p_tracker is null or t.slug = p_tracker)
    and (p_status is null
         or (p_status = 'removed' and c.voided_at is not null)
         or (p_status <> 'removed' and c.voided_at is null and c.status = p_status))
    and (q is null or p.full_name ilike '%' || q || '%' or a.default_name ilike '%' || q || '%')
  order by c.updated_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end; $$;



-- ---------------------------------------------------------------------
-- MEMBER: streak summary (Redesign 2.0 dashboard). Read-only, own data only.
-- Uses the same rule as _streak(): a day counts when it has >= streak_min_daily
-- done (not removed) ticks. Longest = the longest such run of consecutive days.
-- ---------------------------------------------------------------------
create or replace function public.get_my_streaks()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := public.app_today();
  v_longest int;
begin
  if v_uid is null or public.my_role() is null then
    raise exception 'Please log in again.' using errcode = '42501';
  end if;
  with days as (
    select d.checkin_date as day
    from public.daily_checkins d
    where d.member_id = v_uid and d.status = 'done' and d.voided_at is null and d.checkin_date <= v_today
    group by d.checkin_date
    having count(*) >= public.setting_int('streak_min_daily', 1)
  ), runs as (select day - (row_number() over (order by day))::int as grp from days)
  select coalesce(max(n), 0)::int into v_longest from (select count(*) as n from runs group by grp) r;

  return jsonb_build_object(
    'current', public._display_streak(v_uid, v_today),
    'longest', v_longest,
    'min_daily', public.setting_int('streak_min_daily', 1));
end; $$;

-- ---------------------------------------------------------------------
-- Execute permissions: nothing is callable by default
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.app_today(), public.my_role(), public.is_admin(), public.is_super_admin(),
  public.mark_activity(uuid, text, text), public.get_my_dashboard(), public.get_my_streaks(),
  public.get_leaderboard(text, date), public.get_recognitions(date),
  public.admin_void_checkin(uuid, text), public.admin_award_bonus(uuid, int, text),
  public.admin_set_role(uuid, text), public.admin_set_active(uuid, boolean),
  public.admin_update_setting(text, jsonb), public.admin_close_month(date),
  public.admin_overview(date), public.admin_member_report(date, date), public.admin_list_people(),
  public.admin_checkins(date, text, text, text, int)
to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;

-- >>>>>>>>>>>>>>>>>>>> policies.sql
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

-- >>>>>>>>>>>>>>>>>>>> seed.sql
-- =====================================================================
-- Deepak's Redesign Your Life — seed.sql  (run last)
-- Production reference data only: trackers, the 58 activities with the
-- client's original names, badges and point settings.
-- No members or scores are seeded. Safe to run more than once.
-- =====================================================================

insert into public.app_settings(key, value, description) values
  ('timezone',               '"Asia/Kolkata"', 'Day boundary for check-ins'),
  ('daily_completion_bonus', '20', 'Points when every activity is done in a day'),
  ('streak7_bonus',          '30', 'Points on every 7th day of an unbroken streak'),
  ('perfect_week_bonus',     '50', 'Points when every activity is done every day Mon-Sun'),
  ('streak_min_daily',       '1',  'Ticks needed in a day for it to count toward a streak')
on conflict (key) do nothing;

insert into public.tracker_categories(slug, name, tagline, color, icon, sort_order) values
  ('wealth', 'Wealth Habits', 'Small daily habits that build health, focus and abundance.', '#e7b54a', 'sun', 1),
  ('conscious', 'Conscious Habits', 'Stop | Reduce | Take control.', '#e0605a', 'eye', 2),
  ('karma', 'Karma Activities', 'Aware > Apply > Reflect > Transform.', '#f08a3c', 'infinity', 3),
  ('champion', 'Champion Mindsets', 'Train your mind like a champion.', '#5b8cf0', 'trophy', 4)
on conflict (slug) do update set name = excluded.name, tagline = excluded.tagline,
  color = excluded.color, icon = excluded.icon, sort_order = excluded.sort_order;

insert into public.activities(category_id, number, default_name, description, icon, image_path, points)
select c.id, v.number, v.default_name, v.description, v.icon, v.image_path, 10
from (values
  ('wealth', 1, 'E Wakeup', 'Rise early, before the day starts rushing you.', 'sunrise', 'wealth-01.webp'),
  ('wealth', 2, 'E Bowel', 'Clear your system early. A light body starts a light day.', 'leaf', 'wealth-02.webp'),
  ('wealth', 3, 'Hydrate', 'Drink water first thing, then through the day.', 'glass-water', 'wealth-03.webp'),
  ('wealth', 4, 'Forgiveness', 'Release one grudge and free that energy.', 'heart-handshake', 'wealth-04.webp'),
  ('wealth', 5, 'Gratitude', 'Write three things you are thankful for.', 'heart', 'wealth-05.webp'),
  ('wealth', 6, 'Affirmations', 'Speak your affirmations aloud with feeling.', 'mic', 'wealth-06.webp'),
  ('wealth', 7, 'Journaling', 'Write today’s page, honestly.', 'notebook-pen', 'wealth-07.webp'),
  ('wealth', 8, 'Revision', 'Revise what you learned. Learn, revise, grow.', 'book-open', 'wealth-08.webp'),
  ('wealth', 9, 'Move Body EFT', 'Move, stretch and tap through EFT points.', 'activity', 'wealth-09.webp'),
  ('wealth', 10, 'Meditate CBV', 'Sit still and breathe for your set minutes.', 'flower-2', 'wealth-10.webp'),
  ('wealth', 11, 'E Be Happy', 'Choose one moment of joy on purpose.', 'smile', 'wealth-11.webp'),
  ('wealth', 12, 'Live VBS', 'Look at your vision board and feel it real.', 'image', 'wealth-12.webp'),
  ('wealth', 13, 'Ikigai L', 'Take one action toward your purpose.', 'compass', 'wealth-13.webp'),
  ('wealth', 14, 'Unique Skill', 'Practise the skill only you can offer.', 'lightbulb', 'wealth-14.webp'),
  ('wealth', 15, 'Giving', 'Give something: time, help, money or kindness.', 'gift', 'wealth-15.webp'),
  ('wealth', 16, '80/20 To Do List', 'Finish the 20% of tasks that move 80%.', 'list-checks', 'wealth-16.webp'),
  ('conscious', 1, 'Late Night Sleep', 'Slept on time and protected tomorrow’s energy.', 'moon', 'conscious-01.webp'),
  ('conscious', 2, 'Mobile Distractions', 'Used the phone with intention, not on autopilot.', 'smartphone', 'conscious-02.webp'),
  ('conscious', 3, 'News', 'Chose what to take in instead of doom-scrolling.', 'newspaper', 'conscious-03.webp'),
  ('conscious', 4, 'Sugar', 'Kept sugar in check today.', 'candy', 'conscious-04.webp'),
  ('conscious', 5, 'Environment', 'Kept your space clean and supportive.', 'house', 'conscious-05.webp'),
  ('conscious', 6, 'Friends', 'Spent time with people who lift you.', 'users', 'conscious-06.webp'),
  ('conscious', 7, 'False Identity', 'Acted as your true self, not a mask.', 'venetian-mask', 'conscious-07.webp'),
  ('conscious', 8, 'Mental Diarrhea - FAW', 'Caught fear, anxiety and worry loops early.', 'cloud-lightning', 'conscious-08.webp'),
  ('conscious', 9, 'Excuses', 'Did it now instead of later.', 'clock', 'conscious-09.webp'),
  ('conscious', 10, 'Chasing Money', 'Chased value and purpose, and let money follow.', 'coins', 'conscious-10.webp'),
  ('karma', 1, 'Cycle - Desire + Action + Memory - Repeat', 'Notice one desire-action-memory loop you repeated.', 'infinity', 'karma-01.webp'),
  ('karma', 2, 'Action Reaction', 'Pause before reacting. Choose the response.', 'repeat', 'karma-02.webp'),
  ('karma', 3, 'Cause & Effect', 'Trace one result back to its cause.', 'refresh-cw', 'karma-03.webp'),
  ('karma', 4, 'What Is in Your Cup', 'What spilled out when you were shaken today?', 'coffee', 'karma-04.webp'),
  ('karma', 5, 'Thought Pattern', 'Catch a repeating thought and question it.', 'brain', 'karma-05.webp'),
  ('karma', 6, 'Intention', 'Set a clear intention before you act.', 'target', 'karma-06.webp'),
  ('karma', 7, 'Tathastu', 'Speak only what you want to come true.', 'hand', 'karma-07.webp'),
  ('karma', 8, 'Accounts - Karmic Debt', 'Settle one pending account: word, money or apology.', 'scale', 'karma-08.webp'),
  ('karma', 9, 'Forgiveness & Gratitude', 'Forgive one person and thank another.', 'sun', 'karma-09.webp'),
  ('karma', 10, 'Responsibility', 'It starts with you. Own one outcome fully.', 'shield-check', 'karma-10.webp'),
  ('karma', 11, 'Conscious Choice', 'Make one choice slowly and on purpose.', 'signpost', 'karma-11.webp'),
  ('karma', 12, 'God Vs Free Will', 'Reflect on what is yours to do and what to surrender.', 'sparkles', 'karma-12.webp'),
  ('karma', 13, 'Mango Seed', 'Plant a seed today whose fruit others will eat.', 'sprout', 'karma-13.webp'),
  ('karma', 14, 'Salliyan Vs Karma Veerar Kamarajar', 'Act like Kamarajar: serve without seeking credit.', 'crown', 'karma-14.webp'),
  ('karma', 15, 'Offering - Liberation', 'Offer your work and let go of the result.', 'flame', 'karma-15.webp'),
  ('karma', 16, 'Benevolence - Selflessness', 'Do one good deed that expects nothing back.', 'hand-heart', 'karma-16.webp'),
  ('champion', 1, 'Winning Cup - Be Your Best Self', 'Play to your own best, not someone else’s.', 'trophy', 'champion-01.webp'),
  ('champion', 2, 'Challenges / Risks - Part of Game', 'Take on one challenge you’d usually avoid.', 'mountain', 'champion-02.webp'),
  ('champion', 3, 'Burning Desire - Dream Big', 'Revisit your big dream and act on it.', 'rocket', 'champion-03.webp'),
  ('champion', 4, 'Willpower - Never Give Up', 'Push through one moment you wanted to quit.', 'zap', 'champion-04.webp'),
  ('champion', 5, 'Nothing Is Impossible - Keep Trying New', 'Try one new approach today.', 'sparkle', 'champion-05.webp'),
  ('champion', 6, 'Process - Steps - Don''t Cut Corners', 'Follow every step. No shortcuts.', 'trending-up', 'champion-06.webp'),
  ('champion', 7, 'Enjoy Pain - No Pain No Gain', 'Welcome the discomfort of growth.', 'dumbbell', 'champion-07.webp'),
  ('champion', 8, 'Collective Responsibility', 'Lift your team, not just yourself.', 'users', 'champion-08.webp'),
  ('champion', 9, 'Sportsmanship - Learn from Competitors', 'Learn one thing from someone ahead of you.', 'handshake', 'champion-09.webp'),
  ('champion', 10, 'Preparation - Practice - Push Consistently', 'Practise your craft, even on a slow day.', 'target', 'champion-10.webp'),
  ('champion', 11, 'No Ego - No Fear - Make Country Proud', 'Act for something bigger than yourself.', 'flag', 'champion-11.webp'),
  ('champion', 12, 'Physical Fitness - Diet', 'Train your body and eat clean.', 'apple', 'champion-12.webp'),
  ('champion', 13, 'Perform Under Pressure - Last Minute Comeback', 'Stay calm when the clock is against you.', 'timer', 'champion-13.webp'),
  ('champion', 14, 'Self Worth - Emotional Detachment', 'Know your worth without needing approval.', 'gem', 'champion-14.webp'),
  ('champion', 15, 'Focus Next Ball - Present Moment - Meditation', 'Let go of the last ball. Focus on this one.', 'circle-dot', 'champion-15.webp'),
  ('champion', 16, 'Self Awareness - Self Control', 'Notice your urges and choose your actions.', 'eye', 'champion-16.webp')
) as v(slug, number, default_name, description, icon, image_path)
join public.tracker_categories c on c.slug = v.slug
on conflict (category_id, number) do nothing;   -- never overwrite names or coach edits

insert into public.achievements(code, name, description, glyph, color_from, color_to, sort_order) values
  ('first_activity', 'First Activity', 'Tick your first habit', '1', '#f7e5a6', '#b8892f', 1),
  ('streak_7', '7-Day Streak', '7 days in a row', '7', '#ffd29a', '#e0782e', 2),
  ('consistency_30', '30-Day Consistency', '30 days in a row', '30', '#d4dcff', '#5b7fe0', 3),
  ('transformation_60', '60-Day Transformation', '60 days in a row', '60', '#c9f2dc', '#2f9a68', 4),
  ('champion_90', '90-Day Champion', '90 days in a row', '90', '#f7e5a6', '#9a7227', 5),
  ('wealth_master', 'Wealth Master', 'All 16 Wealth Habits done on 7 different days', 'W', '#f7e5a6', '#9a7227', 6),
  ('karma_star', 'Karma Star', 'All 16 Karma Activities done on 7 different days', 'K', '#ffc9a0', '#d0612b', 7),
  ('champion_mindset', 'Champion Mindset', 'All 16 Champion Mindsets done on 7 different days', 'C', '#bcd0ff', '#2d4aa8', 8),
  ('perfect_week', 'Perfect Week', 'Every habit, every day, Monday to Sunday', '★', '#c9f2dc', '#2f9a68', 9),
  ('monthly_champion', 'Monthly Champion', 'Finish a month at #1 on the leaderboard', 'M', '#f7e5a6', '#9a7227', 10)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  glyph = excluded.glyph, color_from = excluded.color_from, color_to = excluded.color_to, sort_order = excluded.sort_order;

-- >>>>>>>>>>>>>>>>>>>> FIRST SUPER ADMIN (run once, after you sign up in the app)
-- Replace the email with the client's login email, then run just this line:
-- update public.profiles set role = 'super_admin' where id = (select id from auth.users where email = 'deepak@example.com');
