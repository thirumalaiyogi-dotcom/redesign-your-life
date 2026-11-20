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

-- can this member use this tracker? 'all' trackers: everyone; 'assigned': only members the coach picked
create or replace function public._sees(p_member uuid, p_category uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tracker_categories c
                 where c.id = p_category
                   and (c.audience = 'all'
                        or exists (select 1 from public.tracker_assignments t
                                   where t.category_id = c.id and t.member_id = p_member)
                        or exists (select 1 from public.profiles pp where pp.id = p_member and pp.role in ('admin','super_admin'))));   -- coaches see every tracker in "Member view"
$$;

-- the same check for the signed-in user (used by row-level security)
create or replace function public.i_see_tracker(p_category uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public._sees(auth.uid(), p_category);
$$;

-- number of activities that count for one member (their trackers only), optionally one tracker
create or replace function public._total_for(p_member uuid, p_category uuid default null)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.activities a join public.tracker_categories c on c.id = a.category_id
  where a.is_active and c.is_active and (p_category is null or a.category_id = p_category)
    and (c.audience = 'all' or exists (select 1 from public.tracker_assignments t
                                       where t.category_id = c.id and t.member_id = p_member)
         or exists (select 1 from public.profiles pp where pp.id = p_member and pp.role in ('admin','super_admin')));
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
    and (p_category is null or a.category_id = p_category)
    and (c.audience = 'all' or exists (select 1 from public.tracker_assignments t
                                       where t.category_id = c.id and t.member_id = p_member)
         or exists (select 1 from public.profiles pp where pp.id = p_member and pp.role in ('admin','super_admin')));
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
  if not public._setting_bool('open_signup', false) and coalesce(current_setting('ryl.coach_create', true), '') <> 'on' then
    raise exception 'Sign-up is closed. Ask your coach for your login.' using errcode = '42501';
  end if;
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
  v_total  int := public._total_for(p_member);
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
  where a.id = p_activity_id and a.is_active and c.is_active and public._sees(v_uid, c.id);
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
  v_total int := public._total_for(auth.uid());
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
    'done_month', (select count(*) from public.daily_checkins x join public.activities a on a.id = x.activity_id
          where x.member_id = v_uid and x.status='done' and x.voided_at is null and x.checkin_date >= v_month and public._sees(v_uid, a.category_id)),
    'weekly_pct', case when v_total = 0 or v_wdays <= 0 then 0 else round(100.0 *
        (select count(*) from public.daily_checkins x join public.activities a on a.id = x.activity_id
          where x.member_id = v_uid and x.status='done' and x.voided_at is null and x.checkin_date >= v_week and public._sees(v_uid, a.category_id))
        / (v_total * v_wdays)) end,
    'monthly_pct', case when v_total = 0 or v_mdays <= 0 then 0 else round(100.0 *
        (select count(*) from public.daily_checkins x join public.activities a on a.id = x.activity_id
          where x.member_id = v_uid and x.status='done' and x.voided_at is null and x.checkin_date >= v_month and public._sees(v_uid, a.category_id))
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
        from public.tracker_categories c where c.is_active and public._sees(v_uid, c.id)),
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
  if p_key = 'open_signup' and jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'Choose open or closed.' using errcode = '22023';
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
        v_members int; v_active int; v_slots bigint;
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  select count(*) into v_members from public.profiles where role = 'member' and is_active;
  select count(distinct member_id) into v_active from public.daily_checkins where checkin_date = d;
  -- habits each active member could tick per day (their own trackers), summed
  select coalesce(sum(public._total_for(p.id)), 0) into v_slots from public.profiles p where p.role = 'member' and p.is_active;
  return jsonb_build_object(
    'date', d,
    'total_members', v_members,
    'active_today', v_active,
    'inactive_today', greatest(v_members - v_active, 0),
    'ticks_today', (select count(*) from public.daily_checkins where checkin_date = d and status = 'done' and voided_at is null),
    'points_week', (select coalesce(sum(points),0) from public.score_history where score_date between w and d),
    'avg_completion_week', case when v_slots = 0 then 0 else round(100.0 *
        (select count(*) from public.daily_checkins c join public.profiles p on p.id = c.member_id
          where p.role = 'member' and p.is_active and c.checkin_date between w and d and c.status = 'done' and c.voided_at is null)
        / (v_slots * (d - w + 1))) end,
    'category_week', (select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'pct',
        case when cm.n = 0 or public._total_active(c.id) = 0 then 0 else least(100, round(100.0 *
          (select count(*) from public.daily_checkins x join public.activities a on a.id = x.activity_id
             join public.profiles p on p.id = x.member_id and p.role = 'member' and p.is_active
            where a.category_id = c.id and x.checkin_date between w and d and x.status = 'done' and x.voided_at is null)
          / (cm.n * public._total_active(c.id) * (d - w + 1)))) end) order by c.sort_order), '[]'::jsonb)
        from public.tracker_categories c
        cross join lateral (select count(*)::int as n from public.profiles p
                            where p.role = 'member' and p.is_active and public._sees(p.id, c.id)) cm
        where c.is_active),
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
-- COACH: per-member progress (read-only). Coaches and super admins only.
-- ---------------------------------------------------------------------
-- One row per member for a day: how many of the active activities they
-- marked done / not done, removed ticks, and points from habits that day.
drop function if exists public.admin_day_summary(date);   -- return type gained "total"
create or replace function public.admin_day_summary(p_date date default null)
returns table(member_id uuid, full_name text, avatar_url text, is_active boolean, joined_on date,
              done int, not_done int, removed int, points int, last_at timestamptz, total int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare d date := coalesce(p_date, public.app_today());
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, p.avatar_url, p.is_active, p.joined_on,
         coalesce(count(*) filter (where c.status = 'done' and c.voided_at is null), 0)::int,
         coalesce(count(*) filter (where c.status = 'not_done' and c.voided_at is null), 0)::int,
         coalesce(count(*) filter (where c.voided_at is not null), 0)::int,
         coalesce(sum(c.points_awarded) filter (where c.voided_at is null), 0)::int,
         max(c.updated_at),
         public._total_for(p.id)
  from public.profiles p
  left join (public.daily_checkins c
             join public.activities a on a.id = c.activity_id and a.is_active
             join public.tracker_categories t on t.id = a.category_id and t.is_active)
         on c.member_id = p.id and c.checkin_date = d and public._sees(p.id, t.id)
  where p.role = 'member' and p.joined_on <= d
  group by p.id
  order by max(c.updated_at) desc nulls last, p.full_name;
end; $$;

-- One member's check-ins for a date range (max 62 days), for the coach's member page.
create or replace function public.admin_member_checkins(p_member uuid, p_start date, p_end date)
returns table(id uuid, checkin_date date, activity_id uuid, status text, note text, points_awarded smallint,
              voided_at timestamptz, void_reason text, voided_by_name text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  if p_member is null or p_start is null or p_end is null or p_end < p_start or p_end - p_start > 62 then
    raise exception 'Choose a member and a date range of up to 62 days.' using errcode = '22023';
  end if;
  return query
  select c.id, c.checkin_date, c.activity_id, c.status, c.note, c.points_awarded,
         c.voided_at, c.void_reason, vb.full_name, c.updated_at
  from public.daily_checkins c
  left join public.profiles vb on vb.id = c.voided_by
  where c.member_id = p_member and c.checkin_date between p_start and p_end
  order by c.checkin_date desc, c.updated_at desc;
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
-- COACH: give / take away an 'assigned' tracker for one member
-- ---------------------------------------------------------------------
create or replace function public.admin_set_tracker_member(p_category uuid, p_member uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cat record; v_changed boolean := false;
begin
  if not public.is_admin() then raise exception 'Only coaches can change trackers.' using errcode = '42501'; end if;
  select id, name, audience into v_cat from public.tracker_categories where id = p_category;
  if not found then raise exception 'Tracker not found.' using errcode = 'P0002'; end if;
  if v_cat.audience <> 'assigned' then raise exception 'This tracker is already open to everyone.' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_member and role = 'member') then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  if coalesce(p_on, false) then
    insert into public.tracker_assignments(category_id, member_id, assigned_by) values (p_category, p_member, auth.uid())
    on conflict do nothing;
    v_changed := found;
    if v_changed then perform public._notify(p_member, 'info', 'New tracker: ' || v_cat.name, 'Your coach added this tracker for you. Open Track to start.'); end if;
  else
    delete from public.tracker_assignments where category_id = p_category and member_id = p_member;
    v_changed := found;
  end if;
  if v_changed then
    perform public._recalc_bonuses(p_member, public.app_today());   -- "all habits done" depends on the member's trackers
    perform public._audit(case when p_on then 'tracker.assign' else 'tracker.unassign' end, 'tracker_categories', p_category::text,
                          jsonb_build_object('member', p_member));
  end if;
end; $$;

-- ---------------------------------------------------------------------
-- Redesign 2.1: updated_at stamps, coach answers a doubt, coach inbox count
-- ---------------------------------------------------------------------
drop trigger if exists goals_touch on public.member_goals;
create trigger goals_touch before update on public.member_goals for each row execute function public.touch_updated_at();
drop trigger if exists sessions_touch on public.sessions;
create trigger sessions_touch before update on public.sessions for each row execute function public.touch_updated_at();
drop trigger if exists session_notes_touch on public.session_notes;
create trigger session_notes_touch before update on public.session_notes for each row execute function public.touch_updated_at();

-- a new published session tells every active member (in-app notification)
create or replace function public.notify_new_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    insert into public.notifications(member_id, kind, title, body)
    select p.id, 'info', 'New session: ' || left(new.title, 100), 'Open Sessions to see the notes, pictures and videos.'
    from public.profiles p where p.role = 'member' and p.is_active;
  end if;
  return new;
end; $$;
drop trigger if exists sessions_notify on public.sessions;
create trigger sessions_notify after insert or update of is_published on public.sessions
  for each row execute function public.notify_new_session();

create or replace function public.admin_answer_doubt(p_doubt uuid, p_answer text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_answer text := nullif(left(trim(coalesce(p_answer, '')), 2000), '');
begin
  if not public.is_admin() then raise exception 'Only coaches can answer questions.' using errcode = '42501'; end if;
  if v_answer is null or char_length(v_answer) < 2 then raise exception 'Write an answer first.' using errcode = '22023'; end if;
  update public.doubts set answer = v_answer, answered_by = auth.uid(), answered_at = now()
   where id = p_doubt returning member_id into v_member;
  if v_member is null then raise exception 'Question not found.' using errcode = 'P0002'; end if;
  perform public._notify(v_member, 'info', 'Your coach answered your question', left(v_answer, 200));
  perform public._audit('doubt.answer', 'doubts', p_doubt::text, jsonb_build_object('member', v_member));
end; $$;

-- open / close one tracker for every active member at once (e.g. after the session that teaches it)
create or replace function public.admin_set_tracker_all(p_category uuid, p_on boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_cat record; r record; n int := 0;
begin
  if not public.is_admin() then raise exception 'Only coaches can change trackers.' using errcode = '42501'; end if;
  select id, name, audience into v_cat from public.tracker_categories where id = p_category;
  if not found then raise exception 'Tracker not found.' using errcode = 'P0002'; end if;
  if v_cat.audience <> 'assigned' then raise exception 'This tracker is already open to everyone.' using errcode = '22023'; end if;
  if coalesce(p_on, false) then
    for r in insert into public.tracker_assignments(category_id, member_id, assigned_by)
             select p_category, p.id, auth.uid() from public.profiles p where p.role = 'member' and p.is_active
             on conflict do nothing returning member_id loop
      perform public._notify(r.member_id, 'info', 'New tracker: ' || v_cat.name, 'Your coach opened this tracker for you. Open Track to start.');
      perform public._recalc_bonuses(r.member_id, public.app_today());
      n := n + 1;
    end loop;
  else
    for r in delete from public.tracker_assignments where category_id = p_category returning member_id loop
      perform public._recalc_bonuses(r.member_id, public.app_today());
      n := n + 1;
    end loop;
  end if;
  perform public._audit(case when p_on then 'tracker.assign_all' else 'tracker.unassign_all' end, 'tracker_categories', p_category::text,
                        jsonb_build_object('members', n));
  return n;
end; $$;

-- habit names of a locked program tracker, so members can see what is coming (no ticking, no materials)
create or replace function public.tracker_preview(p_category uuid)
returns table(number smallint, default_name text)
language sql stable security definer set search_path = '' as $$
  select a.number, a.default_name
  from public.activities a join public.tracker_categories c on c.id = a.category_id
  where c.id = p_category and c.is_active and c.show_locked and a.is_active and public.my_role() is not null
  order by a.number;
$$;

-- coach sends a message to everyone, or to chosen members: in-app notification + phone push (if turned on)
create or replace function public.admin_send_notice(p_title text, p_body text, p_members uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_title text := nullif(left(trim(coalesce(p_title, '')), 120), ''); v_body text := nullif(left(trim(coalesce(p_body, '')), 500), ''); n int;
begin
  if not public.is_admin() then raise exception 'Only coaches can send notifications.' using errcode = '42501'; end if;
  if v_title is null or char_length(v_title) < 3 then raise exception 'Write a title of at least 3 characters.' using errcode = '22023'; end if;
  insert into public.notifications(member_id, kind, title, body)
  select p.id, 'info', v_title, v_body from public.profiles p
  where p.role = 'member' and p.is_active and (p_members is null or p.id = any(p_members));
  get diagnostics n = row_count;
  perform public._audit('notice.send', 'notifications', null, jsonb_build_object('title', v_title, 'members', n, 'all', p_members is null));
  return n;
end; $$;

-- ---------------------------------------------------------------------
-- Automatic reminders (run by pg_cron, see supabase/push.sql). Internal: not callable from the app.
-- Each one only inserts in-app notifications; the send-push Edge Function delivers them to phones.
-- ---------------------------------------------------------------------
-- evening nudge for active members who have not marked anything today
create or replace function public._queue_daily_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare d date := public.app_today(); n int;
begin
  insert into public.notifications(member_id, kind, title, body)
  select p.id, 'reminder', 'Your habits are waiting', 'Take 2 minutes to tick today''s habits before midnight.'
  from public.profiles p
  where p.role = 'member' and p.is_active and public._total_for(p.id) > 0
    and not exists (select 1 from public.daily_checkins c where c.member_id = p.id and c.checkin_date = d)
    and not exists (select 1 from public.notifications x where x.member_id = p.id and x.kind = 'reminder'
                    and x.title = 'Your habits are waiting' and x.created_at >= now() - interval '20 hours');
  get diagnostics n = row_count;
  return n;
end; $$;

-- morning note for members who did not mark anything yesterday (they had trackers and had joined)
create or replace function public._queue_missed_yesterday()
returns int language plpgsql security definer set search_path = '' as $$
declare y date := public.app_today() - 1; n int;
begin
  insert into public.notifications(member_id, kind, title, body)
  select p.id, 'reminder', 'Yesterday''s habits were not submitted', 'No worries. Today is a fresh start: tick today''s habits before midnight.'
  from public.profiles p
  where p.role = 'member' and p.is_active and p.joined_on <= y and public._total_for(p.id) > 0
    and not exists (select 1 from public.daily_checkins c where c.member_id = p.id and c.checkin_date = y)
    and not exists (select 1 from public.notifications x where x.member_id = p.id and x.kind = 'reminder'
                    and x.title = 'Yesterday''s habits were not submitted' and x.created_at >= now() - interval '20 hours');
  get diagnostics n = row_count;
  return n;
end; $$;

-- morning list of to-dos due today
create or replace function public._queue_todo_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare d date := public.app_today(); n int;
begin
  insert into public.notifications(member_id, kind, title, body)
  select t.member_id, 'reminder',
         case when count(*) = 1 then 'To-do today: ' || left(min(t.title), 80) else count(*) || ' to-dos due today' end,
         left(string_agg(t.title, ' · ' order by t.created_at), 480)
  from public.todos t join public.profiles p on p.id = t.member_id and p.is_active
  where t.due_date = d and t.done_at is null
    and not exists (select 1 from public.notifications x where x.member_id = t.member_id and x.kind = 'reminder'
                    and (x.title like 'To-do today:%' or x.title like '% to-dos due today')
                    and x.created_at >= now() - interval '20 hours')
  group by t.member_id;
  get diagnostics n = row_count;
  return n;
end; $$;

-- a phone/browser can belong to one person at a time: saving it moves it to whoever is signed in now
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.my_role() is null then raise exception 'Please log in again.' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Invalid subscription.' using errcode = '22023'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and member_id <> auth.uid();
  insert into public.push_subscriptions(member_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end; $$;

-- send-push claims a batch of undelivered notifications (service role only; never granted to the app)
create or replace function public._claim_push_batch(p_limit int default 300)
returns table(id uuid, member_id uuid, kind text, title text, body text)
language sql security definer set search_path = '' as $$
  update public.notifications n set pushed_at = now()
  where n.id in (select x.id from public.notifications x
                 where x.pushed_at is null and x.created_at >= now() - interval '24 hours'
                 order by x.created_at limit least(greatest(coalesce(p_limit, 300), 1), 500)
                 for update skip locked)
  returning n.id, n.member_id, n.kind, n.title, n.body;
$$;

-- ---------------------------------------------------------------------
-- Redesign 2.4: programs, batches, coach-created accounts, step-by-step tracker opening
-- ---------------------------------------------------------------------
create or replace function public._setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(value) = 'boolean' then (value #>> '{}')::boolean end
                   from public.app_settings where key = p_key), p_default);
$$;

-- the sign-up page asks this before showing its form (accounts are normally made by the coach)
create or replace function public.signup_open()
returns boolean language sql stable security definer set search_path = '' as $$
  select public._setting_bool('open_signup', false);
$$;


-- the member chose their own password → stop asking
create or replace function public.clear_must_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set must_change = false where id = new.id and must_change;
  return new;
end; $$;
drop trigger if exists on_auth_password_changed on auth.users;
create trigger on_auth_password_changed after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.clear_must_change();

-- easy to read out and type on a phone: Ryl-7K4MQ2 (no 0/O, 1/I/L)
create or replace function public._temp_password()
returns text language sql volatile security definer set search_path = '' as $$
  select 'Ryl-' || string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select extensions.gen_random_bytes(6) as b) x, generate_series(0, 5) i;
$$;

-- open the trackers of every finished step of a batch (for all its members, or one member).
-- Returns how many (member, tracker) openings were new. Members get one notification per new tracker.
create or replace function public._open_batch_trackers(p_batch uuid, p_member uuid default null, p_notify boolean default true)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_members uuid[] := '{}';
begin
  for r in
    insert into public.tracker_assignments(category_id, member_id, assigned_by)
    select distinct st.category_id, bm.member_id, auth.uid()
    from public.batch_steps_done d
    join public.step_trackers st on st.step_id = d.step_id
    join public.tracker_categories c on c.id = st.category_id and c.audience = 'assigned'
    join public.batch_members bm on bm.batch_id = d.batch_id
    where d.batch_id = p_batch and (p_member is null or bm.member_id = p_member)
    on conflict do nothing
    returning category_id, member_id
  loop
    n := n + 1;
    if not r.member_id = any(v_members) then v_members := v_members || r.member_id; end if;
    if p_notify then
      perform public._notify(r.member_id, 'info', 'New tracker: ' || (select name from public.tracker_categories where id = r.category_id),
                             'Your coach opened this tracker for you. Open Track to start.');
    end if;
  end loop;
  for i in 1 .. coalesce(array_length(v_members, 1), 0) loop
    perform public._recalc_bonuses(v_members[i], public.app_today());
  end loop;
  return n;
end; $$;

-- COACH: paste a list → accounts. p_people = [{"name":"…","email":"…","phone":"…"}, …] (max 300).
-- New emails get an account with a temporary password (shown once, to send on WhatsApp) and must pick
-- their own password at first login. Emails that already have an account are just added to the batch.
create or replace function public.admin_batch_add_people(p_batch uuid, p_people jsonb)
returns table(full_name text, email text, phone text, temp_password text, status text, member_id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare p jsonb; v_email text; v_name text; v_phone text; v_pw text; v_id uuid; v_role text; v_batch record;
begin
  if not public.is_admin() then raise exception 'Only coaches can add people.' using errcode = '42501'; end if;
  select b.id, b.name into v_batch from public.batches b where b.id = p_batch;
  if not found then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) = 0 then raise exception 'Paste at least one person.' using errcode = '22023'; end if;
  if jsonb_array_length(p_people) > 300 then raise exception 'Add at most 300 people at a time.' using errcode = '22023'; end if;
  perform set_config('ryl.coach_create', 'on', true);

  for p in select * from jsonb_array_elements(p_people) loop
    v_email := lower(trim(coalesce(p ->> 'email', '')));
    v_name  := left(trim(coalesce(p ->> 'name', '')), 80);
    v_phone := nullif(regexp_replace(coalesce(p ->> 'phone', ''), '[^0-9+ ]', '', 'g'), '');
    if v_phone is not null and v_phone !~ '^\+?[0-9 ]{7,16}$' then v_phone := null; end if;
    v_pw := null; v_id := null;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      full_name := v_name; email := v_email; phone := v_phone; temp_password := null; status := 'bad_email'; member_id := null;
      return next; continue;
    end if;
    select u.id into v_id from auth.users u where lower(u.email) = v_email;
    if v_id is null then
      v_id := gen_random_uuid(); v_pw := public._temp_password();
      insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                             confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
              extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}'::jsonb,
              jsonb_build_object('full_name', v_name, 'phone', v_phone), now(), now(), '', '', '', '');
      insert into auth.identities(user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (v_id, v_id::text, 'email', jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), null, now(), now());
      update public.profiles set must_change = true where id = v_id;
      status := 'created';
    else
      select pr.role into v_role from public.profiles pr where pr.id = v_id;
      if v_role is distinct from 'member' then
        full_name := v_name; email := v_email; phone := v_phone; temp_password := null; status := 'not_member'; member_id := v_id;
        return next; continue;
      end if;
      status := 'existing';
      if v_phone is not null then update public.profiles pr set phone = v_phone where pr.id = v_id and pr.phone is null; end if;
    end if;
    insert into public.batch_members(batch_id, member_id, added_by) values (p_batch, v_id, auth.uid()) on conflict do nothing;
    perform public._open_batch_trackers(p_batch, v_id, status = 'existing');   -- steps already done → their trackers
    select pr.full_name, pr.phone into full_name, phone from public.profiles pr where pr.id = v_id;
    email := v_email; temp_password := v_pw; member_id := v_id;
    return next;
  end loop;
  perform public._audit('batch.add_people', 'batches', p_batch::text, jsonb_build_object('count', jsonb_array_length(p_people)));
end; $$;

-- COACH: a member lost the temporary password, or never logged in → a new one (asked to change at login)
create or replace function public.admin_reset_temp_password(p_member uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_pw text := public._temp_password();
begin
  if not public.is_admin() then raise exception 'Only coaches can reset passwords.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_member and role = 'member') then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  update auth.users set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')), updated_at = now(),
         email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = p_member;
  update public.profiles set must_change = true where id = p_member;   -- after the update: the password trigger clears it
  perform public._audit('member.temp_password', 'profiles', p_member::text, '{}'::jsonb);
  return v_pw;
end; $$;

create or replace function public.admin_batch_remove_member(p_batch uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only coaches can change batches.' using errcode = '42501'; end if;
  delete from public.batch_members where batch_id = p_batch and member_id = p_member;
  if not found then raise exception 'This person is not in the batch.' using errcode = 'P0002'; end if;
  perform public._audit('batch.remove_member', 'batches', p_batch::text, jsonb_build_object('member', p_member));
end; $$;

-- COACH: "Day N done ✓" → that step's trackers open for everyone in the batch, and they are told.
-- Undo only removes the mark; trackers already opened stay open (close them per member if needed).
create or replace function public.admin_batch_step_done(p_batch uuid, p_step uuid, p_done boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_step record; v_names text; n int := 0;
begin
  if not public.is_admin() then raise exception 'Only coaches can mark classes done.' using errcode = '42501'; end if;
  select s.id, s.day_no, s.title into v_step from public.program_steps s join public.batches b on b.program_id = s.program_id
   where s.id = p_step and b.id = p_batch;
  if not found then raise exception 'This class is not part of the batch''s program.' using errcode = 'P0002'; end if;
  if not coalesce(p_done, false) then
    delete from public.batch_steps_done where batch_id = p_batch and step_id = p_step;
    perform public._audit('batch.step_undone', 'batches', p_batch::text, jsonb_build_object('step', p_step));
    return 0;
  end if;
  insert into public.batch_steps_done(batch_id, step_id, done_by) values (p_batch, p_step, auth.uid()) on conflict do nothing;
  if not found then return 0; end if;
  n := public._open_batch_trackers(p_batch, null, false);
  select string_agg(c.name, ', ' order by c.sort_order) into v_names
    from public.step_trackers st join public.tracker_categories c on c.id = st.category_id where st.step_id = p_step;
  insert into public.notifications(member_id, kind, title, body)
  select bm.member_id, 'info', left('Day ' || v_step.day_no || ' done: ' || v_step.title, 120),
         case when v_names is not null then left('Now open: ' || v_names || '. Start ticking from today.', 500)
              else 'Open Sessions to see today''s notes.' end
  from public.batch_members bm join public.profiles p on p.id = bm.member_id and p.is_active
  where bm.batch_id = p_batch;
  perform public._audit('batch.step_done', 'batches', p_batch::text, jsonb_build_object('step', p_step, 'opened', n));
  return n;
end; $$;

-- COACH: which trackers a class opens. Adding one to a class a batch already finished opens it for that batch now.
create or replace function public.admin_set_step_tracker(p_step uuid, p_category uuid, p_on boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare n int := 0; b record;
begin
  if not public.is_admin() then raise exception 'Only coaches can change programs.' using errcode = '42501'; end if;
  if not exists (select 1 from public.program_steps where id = p_step) then raise exception 'Class not found.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.tracker_categories where id = p_category and audience = 'assigned') then
    raise exception 'This tracker is open to everyone already.' using errcode = '22023';
  end if;
  if coalesce(p_on, false) then
    insert into public.step_trackers(step_id, category_id) values (p_step, p_category) on conflict do nothing;
    for b in select batch_id from public.batch_steps_done where step_id = p_step loop
      n := n + public._open_batch_trackers(b.batch_id, null, true);
    end loop;
  else
    delete from public.step_trackers where step_id = p_step and category_id = p_category;
  end if;
  return n;
end; $$;

-- COACH: a new tracker sheet (e.g. a workshop's own habits). Opens per member / per batch class, like the program trackers.
create or replace function public.admin_create_tracker(p_name text, p_tagline text default null, p_color text default '#5b8cf0', p_show_locked boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := nullif(left(trim(coalesce(p_name, '')), 60), ''); v_slug text; v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only coaches can create trackers.' using errcode = '42501'; end if;
  if v_name is null or char_length(v_name) < 2 then raise exception 'Give the tracker a name.' using errcode = '22023'; end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Pick a colour.' using errcode = '22023'; end if;
  v_slug := left(trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), 24);
  if v_slug !~ '^[a-z][a-z0-9-]{1,30}$' or exists (select 1 from public.tracker_categories where slug = v_slug) then
    v_slug := 't-' || substr(md5(gen_random_uuid()::text), 1, 8);
  end if;
  insert into public.tracker_categories(slug, name, tagline, color, sort_order, audience, show_locked)
  values (v_slug, v_name, nullif(left(trim(coalesce(p_tagline, '')), 160), ''), lower(p_color),
          coalesce((select max(sort_order) from public.tracker_categories), 0) + 1, 'assigned', coalesce(p_show_locked, false))
  returning id into v_id;
  perform public._audit('tracker.create', 'tracker_categories', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end; $$;

create or replace function public.admin_update_tracker(p_category uuid, p_name text, p_tagline text, p_color text, p_show_locked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := nullif(left(trim(coalesce(p_name, '')), 60), '');
begin
  if not public.is_admin() then raise exception 'Only coaches can change trackers.' using errcode = '42501'; end if;
  if v_name is null or char_length(v_name) < 2 then raise exception 'Give the tracker a name.' using errcode = '22023'; end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Pick a colour.' using errcode = '22023'; end if;
  update public.tracker_categories set name = v_name, tagline = nullif(left(trim(coalesce(p_tagline, '')), 160), ''),
         color = lower(p_color), show_locked = coalesce(p_show_locked, show_locked)
   where id = p_category;
  if not found then raise exception 'Tracker not found.' using errcode = 'P0002'; end if;
  perform public._audit('tracker.update', 'tracker_categories', p_category::text, jsonb_build_object('name', v_name));
end; $$;

-- COACH: add one habit to a tracker (next number). The name is fixed once saved, like the original 58.
create or replace function public.admin_add_habit(p_category uuid, p_name text, p_description text default null, p_points int default 10)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := nullif(left(trim(coalesce(p_name, '')), 80), ''); v_no int; v_id uuid;
begin
  if not public.is_admin() then raise exception 'Only coaches can add habits.' using errcode = '42501'; end if;
  if v_name is null or char_length(v_name) < 2 then raise exception 'Write the habit name.' using errcode = '22023'; end if;
  if coalesce(p_points, -1) not between 0 and 100 then raise exception 'Points must be between 0 and 100.' using errcode = '22023'; end if;
  perform 1 from public.tracker_categories where id = p_category for update;
  if not found then raise exception 'Tracker not found.' using errcode = 'P0002'; end if;
  select coalesce(max(number), 0) + 1 into v_no from public.activities where category_id = p_category;
  if v_no > 99 then raise exception 'A tracker can have at most 99 habits.' using errcode = '22023'; end if;
  insert into public.activities(category_id, number, default_name, description, points)
  values (p_category, v_no, v_name, nullif(left(trim(coalesce(p_description, '')), 400), ''), p_points)
  returning id into v_id;
  perform public._audit('activity.create', 'activities', v_id::text, jsonb_build_object('tracker', p_category, 'name', v_name));
  return v_id;
end; $$;

-- the signed-in member's batches (coaches: every active batch), newest first, with class progress
create or replace function public.my_batches()
returns table(id uuid, name text, program text, kind text, starts_on date, steps_total int, steps_done int, members int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null or public.my_role() is null then raise exception 'Please log in again.' using errcode = '42501'; end if;
  return query
  select b.id, b.name, pg.name, pg.kind, b.starts_on,
         (select count(*)::int from public.program_steps s where s.program_id = b.program_id),
         (select count(*)::int from public.batch_steps_done d where d.batch_id = b.id),
         (select count(*)::int from public.batch_members m where m.batch_id = b.id)
  from public.batches b join public.programs pg on pg.id = b.program_id
  where b.is_active and (public.is_admin() or exists (select 1 from public.batch_members m where m.batch_id = b.id and m.member_id = auth.uid()))
  order by b.starts_on desc, b.created_at desc;
end; $$;

-- Batch leaderboard: only the people of one batch, points since the batch started.
-- p_period: 'batch' (since start), 'weekly' (this week, not before the start), 'daily' (today).
create or replace function public.get_batch_leaderboard(p_batch uuid default null, p_period text default 'batch')
returns table(rank int, member_id uuid, full_name text, avatar_url text, points bigint, activities_done bigint,
              consistency numeric, streak int, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare d date := public.app_today(); v_batch uuid := p_batch; v_start date; s date;
begin
  if auth.uid() is null or public.my_role() is null then raise exception 'Please log in again.' using errcode = '42501'; end if;
  if v_batch is null then
    select b.id into v_batch from public.batches b join public.batch_members m on m.batch_id = b.id and m.member_id = auth.uid()
     where b.is_active order by b.starts_on desc, b.created_at desc limit 1;
    if v_batch is null then return; end if;
  end if;
  if not public.is_admin() and not exists (select 1 from public.batch_members m where m.batch_id = v_batch and m.member_id = auth.uid()) then
    raise exception 'You are not in this batch.' using errcode = '42501';
  end if;
  select b.starts_on into v_start from public.batches b where b.id = v_batch;
  if v_start is null then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  s := case p_period when 'batch' then v_start
                     when 'weekly' then greatest(v_start, date_trunc('week', d)::date)
                     when 'daily' then d
                     else null end;
  if s is null then raise exception 'Unknown period: %', p_period using errcode = '22023'; end if;
  if s > d then s := d; end if;
  return query
  with cur as (
    select st.*, public._display_streak(st.member_id, d) as stk, p.full_name as nm, p.avatar_url as av
    from public._period_stats(s, d) st
    join public.batch_members bm on bm.member_id = st.member_id and bm.batch_id = v_batch
    join public.profiles p on p.id = st.member_id)
  select row_number() over (order by cur.points desc, cur.consistency desc, cur.stk desc,
                                     cur.last_score_at asc nulls last, cur.nm, cur.member_id)::int,
         cur.member_id, cur.nm, cur.av, cur.points, cur.activities_done, cur.consistency, cur.stk, cur.member_id = auth.uid()
  from cur order by 1;
end; $$;

-- COACH: people of one batch, with login status (who has not logged in yet / still on the temporary password)
create or replace function public.admin_batch_people(p_batch uuid)
returns table(member_id uuid, full_name text, email text, phone text, must_change boolean, last_sign_in_at timestamptz,
              is_active boolean, points bigint, added_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_start date;
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  select starts_on into v_start from public.batches where id = p_batch;
  if v_start is null then raise exception 'Batch not found.' using errcode = 'P0002'; end if;
  return query
  select p.id, p.full_name, u.email::text, p.phone, p.must_change, u.last_sign_in_at, p.is_active,
         coalesce((select sum(s.points) from public.score_history s where s.member_id = p.id and s.score_date >= v_start), 0)::bigint,
         bm.created_at
  from public.batch_members bm join public.profiles p on p.id = bm.member_id join auth.users u on u.id = p.id
  where bm.batch_id = p_batch
  order by p.full_name;
end; $$;

-- Google login (2.4): a member who comes in with Google has no temporary password to change
create or replace function public.clear_must_change_on_oauth()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider <> 'email' then
    update public.profiles set must_change = false where id = new.user_id and must_change;
  end if;
  return new;
end; $$;
drop trigger if exists on_auth_identity_linked on auth.identities;
create trigger on_auth_identity_linked after insert on auth.identities
  for each row execute function public.clear_must_change_on_oauth();

create or replace function public._todo_next_due(p_due date, p_repeat text)
returns date language plpgsql immutable set search_path = '' as $$
declare d date := p_due;
begin
  if p_repeat = 'daily' then return d + 1;
  elsif p_repeat = 'weekly' then return d + 7;
  elsif p_repeat = 'monthly' then return (d + interval '1 month')::date;
  elsif p_repeat = 'weekdays' then
    d := d + 1; while extract(isodow from d) > 5 loop d := d + 1; end loop; return d;
  end if;
  return null;
end; $$;

create or replace function public.todo_repeat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_today date := public.app_today(); v_next date;
begin
  if new.repeat is null then return new; end if;
  if old.done_at is null and new.done_at is not null then
    -- next date after today (a late tick on a daily task does not leave a trail of past copies)
    v_next := public._todo_next_due(coalesce(new.due_date, v_today), new.repeat);
    while v_next <= v_today loop v_next := public._todo_next_due(v_next, new.repeat); end loop;
    if not exists (select 1 from public.todos t where t.repeat_of = new.id) then
      insert into public.todos(member_id, title, due_date, quadrant, repeat, repeat_of)
      values (new.member_id, new.title, v_next, new.quadrant, new.repeat, new.id);
    end if;
  elsif old.done_at is not null and new.done_at is null then
    delete from public.todos t where t.repeat_of = new.id and t.done_at is null;
  end if;
  return new;
end; $$;
drop trigger if exists todos_repeat on public.todos;
create trigger todos_repeat after update of done_at on public.todos for each row execute function public.todo_repeat();

-- a member's new question tells every coach (in-app + phone push, like a chat message)
create or replace function public.notify_new_doubt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text; v_topic text;
begin
  select nullif(trim(full_name), '') into v_name from public.profiles where id = new.member_id;
  select coalesce((select c.name from public.tracker_categories c where c.id = new.category_id),
                  (select a.default_name from public.activities a where a.id = new.activity_id),
                  (select s.title from public.sessions s where s.id = new.session_id)) into v_topic;
  insert into public.notifications(member_id, kind, title, body)
  select p.id, 'info', left('New question from ' || coalesce(v_name, 'a member'), 120),
         left(coalesce(v_topic || ': ', '') || new.question, 300)
  from public.profiles p where p.role in ('admin', 'super_admin') and p.is_active;
  return new;
end; $$;
drop trigger if exists doubts_notify on public.doubts;
create trigger doubts_notify after insert on public.doubts for each row execute function public.notify_new_doubt();

-- signed in with a code sent to their own email: they do not need to change the coach's temporary password first
create or replace function public.skip_temp_password()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set must_change = false where id = auth.uid() and must_change;
$$;

-- ---------------------------------------------------------------------
-- Execute permissions: nothing is callable by default
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public._claim_push_batch(int) to service_role;

grant execute on function
  public.app_today(), public.my_role(), public.is_admin(), public.is_super_admin(),
  public.mark_activity(uuid, text, text), public.get_my_dashboard(), public.get_my_streaks(),
  public.get_leaderboard(text, date), public.get_recognitions(date),
  public.admin_void_checkin(uuid, text), public.admin_award_bonus(uuid, int, text),
  public.admin_set_role(uuid, text), public.admin_set_active(uuid, boolean),
  public.admin_update_setting(text, jsonb), public.admin_close_month(date),
  public.admin_overview(date), public.admin_member_report(date, date), public.admin_list_people(),
  public.admin_checkins(date, text, text, text, int),
  public.admin_day_summary(date), public.admin_member_checkins(uuid, date, date),
  public.admin_set_tracker_member(uuid, uuid, boolean), public.i_see_tracker(uuid),
  public.admin_answer_doubt(uuid, text), public.save_push_subscription(text, text, text),
  public.admin_set_tracker_all(uuid, boolean), public.tracker_preview(uuid),
  public.admin_send_notice(text, text, uuid[]),
  public.admin_batch_add_people(uuid, jsonb), public.admin_reset_temp_password(uuid),
  public.admin_batch_remove_member(uuid, uuid), public.admin_batch_step_done(uuid, uuid, boolean),
  public.admin_set_step_tracker(uuid, uuid, boolean), public.admin_create_tracker(text, text, text, boolean),
  public.admin_update_tracker(uuid, text, text, text, boolean), public.admin_add_habit(uuid, text, text, int),
  public.my_batches(), public.get_batch_leaderboard(uuid, text), public.admin_batch_people(uuid)
to authenticated;
-- the sign-up page checks this before anyone is logged in
grant execute on function public.signup_open() to anon, authenticated;
grant execute on function public.skip_temp_password() to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;

-- A shared demo login (app_settings 'demo_account' = its user id) must keep its email and password,
-- so one person cannot lock everyone else out. (migration ryl_27_demo_account_guard)
create or replace function public.guard_demo_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_demo text;
begin
  select s.value #>> '{}' into v_demo from public.app_settings s where s.key = 'demo_account';
  if v_demo is not null and old.id::text = v_demo then
    if tg_table_schema = 'auth' and (new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email) then
      raise exception 'The shared demo login cannot be changed.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_demo_account() from public, anon, authenticated;
drop trigger if exists on_auth_demo_guard on auth.users;
create trigger on_auth_demo_guard before update on auth.users for each row execute function public.guard_demo_account();

-- Membership dates (migration ryl_28_membership_dates)
create or replace function public.admin_set_membership(p_member uuid, p_since date, p_renews date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only coaches can change membership dates.' using errcode = '42501'; end if;
  if p_since is not null and p_renews is not null and p_renews < p_since then
    raise exception 'Renewal date must be after the joining date.' using errcode = '22023';
  end if;
  update public.profiles set member_since = p_since, renews_on = p_renews where id = p_member;
  if not found then raise exception 'Member not found.' using errcode = 'P0002'; end if;
  perform public._audit('member.membership', 'profiles', p_member::text,
                        jsonb_build_object('member_since', p_since, 'renews_on', p_renews));
end $$;
revoke all on function public.admin_set_membership(uuid, date, date) from public, anon;
grant execute on function public.admin_set_membership(uuid, date, date) to authenticated;

-- Coaches get a notification 7 days before, 1 day before and on the renewal day.
create or replace function public._queue_renewal_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_today date := public.app_today(); n integer;
begin
  insert into public.notifications(member_id, kind, title, body)
  select a.id, 'info',
         left(case m.renews_on - v_today when 0 then 'Renewal today: ' when 1 then 'Renewal tomorrow: ' else 'Renewal in 7 days: ' end
              || coalesce(nullif(m.full_name, ''), 'a member'), 120),
         'Membership renews on ' || to_char(m.renews_on, 'DD Mon YYYY') || coalesce(' · ' || m.phone, '')
  from public.profiles m
  join public.profiles a on a.role in ('admin', 'super_admin') and a.is_active
  where m.role = 'member' and m.is_active and m.renews_on - v_today in (7, 1, 0);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public._queue_renewal_reminders() from public, anon, authenticated;

-- Join form (migration ryl_29_join_form)
-- PUBLIC: anyone with the link can send their details (no account is made here)
create or replace function public.submit_join_request(p_name text, p_city text, p_phone text, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_name text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
        v_city text := nullif(left(trim(coalesce(p_city, '')), 60), '');
        v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
        v_email text := lower(trim(coalesce(p_email, '')));
        v_new boolean;
begin
  if char_length(v_name) < 2 then raise exception 'Please enter your name.' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'Please enter a valid email.' using errcode = '22023'; end if;
  if v_phone ~ '^[0-9]{10}$' then v_phone := '+91' || v_phone; end if;
  if v_phone !~ '^\+?[0-9]{7,15}$' then raise exception 'Please enter a valid phone number.' using errcode = '22023'; end if;
  if (select count(*) from public.join_requests where status = 'pending') >= 1000 then
    raise exception 'Too many requests right now. Please try again later.' using errcode = '53400';
  end if;
  insert into public.join_requests(full_name, city, phone, email) values (v_name, v_city, v_phone, v_email)
  on conflict (lower(email)) where status = 'pending'
  do update set full_name = excluded.full_name, city = excluded.city, phone = excluded.phone, created_at = now()
  returning (xmax = 0) into v_new;
  if v_new then
    insert into public.notifications(member_id, kind, title, body)
    select a.id, 'info', left('New join request: ' || v_name, 120), coalesce(v_city || ' · ', '') || v_phone
      from public.profiles a where a.role in ('admin', 'super_admin') and a.is_active;
  end if;
  return 'received';
end $$;
revoke all on function public.submit_join_request(text, text, text, text) from public;
grant execute on function public.submit_join_request(text, text, text, text) to anon, authenticated;

-- COACH: approve → account (or existing member) + batch + chosen trackers; returns the login details
create or replace function public.admin_approve_join(p_request uuid, p_batch uuid, p_trackers uuid[])
returns table(full_name text, email text, phone text, temp_password text, status text, member_id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare r public.join_requests; a record;
begin
  if not public.is_admin() then raise exception 'Only coaches can approve.' using errcode = '42501'; end if;
  select * into r from public.join_requests j where j.id = p_request and j.status = 'pending' for update;
  if not found then raise exception 'This request was already handled.' using errcode = 'P0002'; end if;
  select * into a from public.admin_batch_add_people(p_batch, jsonb_build_array(jsonb_build_object('name', r.full_name, 'email', r.email, 'phone', r.phone)));
  if a.status not in ('created', 'existing') then
    raise exception '%', case a.status when 'not_member' then 'This email belongs to a coach.' else 'The email is not valid.' end using errcode = '22023';
  end if;
  update public.profiles pr set city = coalesce(r.city, pr.city) where pr.id = a.member_id;
  insert into public.tracker_assignments(category_id, member_id, assigned_by)
  select c.id, a.member_id, auth.uid() from public.tracker_categories c where c.id = any(coalesce(p_trackers, '{}'))
  on conflict do nothing;
  update public.join_requests j set status = 'approved', member_id = a.member_id, decided_at = now(), decided_by = auth.uid() where j.id = r.id;
  perform public._audit('join.approve', 'join_requests', r.id::text, jsonb_build_object('member', a.member_id, 'batch', p_batch));
  full_name := a.full_name; email := a.email; phone := a.phone; temp_password := a.temp_password; status := a.status; member_id := a.member_id;
  return next;
end $$;
revoke all on function public.admin_approve_join(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.admin_approve_join(uuid, uuid, uuid[]) to authenticated;

create or replace function public.admin_dismiss_join(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only coaches can do this.' using errcode = '42501'; end if;
  update public.join_requests set status = 'dismissed', decided_at = now(), decided_by = auth.uid() where id = p_request and status = 'pending';
  perform public._audit('join.dismiss', 'join_requests', p_request::text, '{}'::jsonb);
end $$;
revoke all on function public.admin_dismiss_join(uuid) from public, anon;
grant execute on function public.admin_dismiss_join(uuid) to authenticated;

-- Family link (migration ryl_30_family_link)
create or replace function public._family_token()
returns text language sql volatile security definer set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;
revoke all on function public._family_token() from public, anon, authenticated;

create or replace function public._family_password()
returns text language sql volatile security definer set search_path = '' as $$
  select 'F' || translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;
revoke all on function public._family_password() from public, anon, authenticated;

-- PUBLIC (link): family name and who is in it, so a person can tap their name
create or replace function public.family_info(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare f public.families;
begin
  select * into f from public.families where token = p_token and is_active;
  if not found then raise exception 'This family link is not working. Ask your coach for a new one.' using errcode = 'P0002'; end if;
  return jsonb_build_object('name', f.name, 'full', (select count(*) from public.family_members m where m.family_id = f.id) >= f.max_people,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'avatar', p.avatar_url) order by m.added_at)
       from public.family_members m join public.profiles p on p.id = m.member_id
      where m.family_id = f.id and m.via_link and p.is_active and p.role = 'member'), '[]'::jsonb));
end $$;
revoke all on function public.family_info(text) from public;
grant execute on function public.family_info(text) to anon, authenticated;

-- PUBLIC (link): first time — type your name → an account in this family with the family's trackers
create or replace function public.family_join(p_token text, p_name text)
returns table(member_id uuid, email text, password text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare f public.families; v_name text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 80);
        v_id uuid := gen_random_uuid(); v_email text; v_pw text := public._family_password();
begin
  select * into f from public.families fa where fa.token = p_token and fa.is_active for update;
  if not found then raise exception 'This family link is not working. Ask your coach for a new one.' using errcode = 'P0002'; end if;
  if char_length(v_name) < 2 then raise exception 'Please type your name.' using errcode = '22023'; end if;
  if (select count(*) from public.family_members m where m.family_id = f.id) >= f.max_people then
    raise exception 'This family is full. Ask your coach to add more people.' using errcode = '53400';
  end if;
  if exists (select 1 from public.family_members m join public.profiles p on p.id = m.member_id
              where m.family_id = f.id and lower(p.full_name) = lower(v_name)) then
    raise exception 'This name is already in the family. Tap it in the list.' using errcode = '23505';
  end if;
  v_email := 'f-' || replace(v_id::text, '-', '') || '@family.invalid';
  perform set_config('ryl.coach_create', 'on', true);
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                         confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name), now(), now(), '', '', '', '');
  insert into auth.identities(user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (v_id, v_id::text, 'email', jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), null, now(), now());
  insert into public.family_members(member_id, family_id, via_link) values (v_id, f.id, true);
  insert into public.tracker_assignments(category_id, member_id, assigned_by)
  select c.id, v_id, f.created_by from public.tracker_categories c where c.id = any(f.trackers) on conflict do nothing;
  insert into public.notifications(member_id, kind, title, body)
  select a.id, 'info', left(v_name || ' joined ' || f.name, 120), 'Family link'
    from public.profiles a where a.role in ('admin', 'super_admin') and a.is_active;
  member_id := v_id; email := v_email; password := v_pw;
  return next;
end $$;
revoke all on function public.family_join(text, text) from public;
grant execute on function public.family_join(text, text) to anon, authenticated;

-- PUBLIC (link): next time — tap your name → a fresh login for that person (only link-made accounts of this family)
create or replace function public.family_enter(p_token text, p_member uuid)
returns table(email text, password text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_pw text := public._family_password(); v_email text;
begin
  select u.email into v_email
    from public.families f join public.family_members m on m.family_id = f.id and m.via_link
    join public.profiles p on p.id = m.member_id and p.role = 'member' and p.is_active
    join auth.users u on u.id = m.member_id
   where f.token = p_token and f.is_active and m.member_id = p_member;
  if v_email is null then raise exception 'This name is not in the family any more. Ask your coach.' using errcode = 'P0002'; end if;
  update auth.users set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')), updated_at = now() where id = p_member;
  email := v_email; password := v_pw;
  return next;
end $$;
revoke all on function public.family_enter(text, uuid) from public;
grant execute on function public.family_enter(text, uuid) to anon, authenticated;

-- MEMBER: my family (null if none)
create or replace function public.my_family()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', f.id, 'name', f.name, 'token', case when f.is_active then f.token end,   -- so the family can invite more people
                            'people', (select count(*) from public.family_members x where x.family_id = f.id))
  from public.family_members m join public.families f on f.id = m.family_id
  where m.member_id = auth.uid();
$$;
revoke all on function public.my_family() from public, anon;
grant execute on function public.my_family() to authenticated;

-- MEMBER: everyone in my family — today's ticks, points this week / in total, streak
create or replace function public.family_overview()
returns table(member_id uuid, full_name text, avatar_url text, done_today int, total_today int,
              points_today bigint, points_week bigint, points_total bigint, streak int, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_fam uuid; d date := public.app_today();
begin
  select m.family_id into v_fam from public.family_members m where m.member_id = auth.uid();
  if v_fam is null then raise exception 'You are not in a family.' using errcode = '42501'; end if;
  return query
  select p.id, p.full_name, p.avatar_url, public._done_on(p.id, d), public._total_for(p.id),
         coalesce((select sum(s.points) from public.score_history s where s.member_id = p.id and s.score_date = d), 0)::bigint,
         coalesce((select sum(s.points) from public.score_history s where s.member_id = p.id and s.score_date between date_trunc('week', d)::date and d), 0)::bigint,
         coalesce((select sum(s.points) from public.score_history s where s.member_id = p.id), 0)::bigint,
         public._display_streak(p.id, d), p.id = auth.uid()
  from public.family_members m join public.profiles p on p.id = m.member_id
  where m.family_id = v_fam and p.is_active
  order by 8 desc, p.full_name;
end $$;
revoke all on function public.family_overview() from public, anon;
grant execute on function public.family_overview() to authenticated;

-- MEMBER: one family member's habits on one day (last 31 days). Ticks only — no notes.
create or replace function public.family_member_day(p_member uuid, p_day date default null)
returns table(category text, slug text, color text, sort_order smallint, number smallint, activity text, status text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare d date := coalesce(p_day, public.app_today());
begin
  if not exists (select 1 from public.family_members a join public.family_members b on b.family_id = a.family_id
                  where a.member_id = auth.uid() and b.member_id = p_member) then
    raise exception 'You can only see people in your family.' using errcode = '42501';
  end if;
  if d > public.app_today() or d < public.app_today() - 31 then raise exception 'Choose a day in the last month.' using errcode = '22023'; end if;
  return query
  select c.name, c.slug, c.color, c.sort_order, a.number, a.default_name,
         (select k.status from public.daily_checkins k where k.member_id = p_member and k.activity_id = a.id and k.checkin_date = d and k.voided_at is null)
  from public.activities a join public.tracker_categories c on c.id = a.category_id
  where a.is_active and c.is_active and public._sees(p_member, c.id)
    and exists (select 1 from public.profiles pp where pp.id = p_member and pp.role = 'member')
  order by c.sort_order, a.number;
end $$;
revoke all on function public.family_member_day(uuid, date) from public, anon;
grant execute on function public.family_member_day(uuid, date) to authenticated;

-- COACH: make a family (returns its id; the link token is read from the families table)
create or replace function public.admin_create_family(p_name text, p_trackers uuid[], p_max int default 12)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
begin
  if not public.is_admin() then raise exception 'Only coaches can make families.' using errcode = '42501'; end if;
  if char_length(v_name) < 2 then raise exception 'Type a family name.' using errcode = '22023'; end if;
  insert into public.families(name, token, trackers, max_people, created_by)
  values (v_name, public._family_token(),
          coalesce((select array_agg(c.id) from public.tracker_categories c where c.id = any(coalesce(p_trackers, '{}'))), '{}'),
          least(greatest(coalesce(p_max, 12), 1), 30), auth.uid())
  returning id into v_id;
  perform public._audit('family.create', 'families', v_id::text, jsonb_build_object('name', v_name));
  return v_id;
end $$;
revoke all on function public.admin_create_family(text, uuid[], int) from public, anon;
grant execute on function public.admin_create_family(text, uuid[], int) to authenticated;

-- COACH: rename / change trackers (for new joiners; with p_apply also opens them for people already in) / size / pause / new link
create or replace function public.admin_update_family(p_family uuid, p_name text, p_trackers uuid[], p_max int, p_active boolean,
                                                      p_new_link boolean default false, p_apply boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 60);
begin
  if not public.is_admin() then raise exception 'Only coaches can change families.' using errcode = '42501'; end if;
  if char_length(v_name) < 2 then raise exception 'Type a family name.' using errcode = '22023'; end if;
  update public.families set name = v_name,
         trackers = coalesce((select array_agg(c.id) from public.tracker_categories c where c.id = any(coalesce(p_trackers, '{}'))), '{}'),
         max_people = least(greatest(coalesce(p_max, max_people), 1), 30), is_active = coalesce(p_active, is_active),
         token = case when p_new_link then public._family_token() else token end
   where id = p_family;
  if not found then raise exception 'Family not found.' using errcode = 'P0002'; end if;
  if p_apply then
    insert into public.tracker_assignments(category_id, member_id, assigned_by)
    select c, m.member_id, auth.uid() from public.family_members m, unnest(coalesce(p_trackers, '{}')) c
     where m.family_id = p_family and exists (select 1 from public.tracker_categories t where t.id = c)
    on conflict do nothing;
  end if;
  perform public._audit('family.update', 'families', p_family::text, jsonb_build_object('new_link', p_new_link, 'active', p_active));
end $$;
revoke all on function public.admin_update_family(uuid, text, uuid[], int, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_update_family(uuid, text, uuid[], int, boolean, boolean, boolean) to authenticated;

-- COACH: take a person out of a family (their account, ticks and points stay; the family link no longer opens it)
create or replace function public.admin_family_remove(p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only coaches can change families.' using errcode = '42501'; end if;
  delete from public.family_members where member_id = p_member;
  if not found then raise exception 'This person is not in a family.' using errcode = 'P0002'; end if;
  perform public._audit('family.remove', 'family_members', p_member::text, '{}'::jsonb);
end $$;
revoke all on function public.admin_family_remove(uuid) from public, anon;
grant execute on function public.admin_family_remove(uuid) to authenticated;

-- App setup (migration ryl_31_app_setup)
create or replace function public.mark_app_installed()
returns void language sql volatile security definer set search_path = '' as $$
  update public.profiles set app_installed_at = now() where id = auth.uid() and app_installed_at is null;
$$;
revoke all on function public.mark_app_installed() from public, anon;
grant execute on function public.mark_app_installed() to authenticated;

-- COACH: per member — app installed? how many phones get notifications?
create or replace function public.admin_setup_status()
returns table(member_id uuid, app_installed_at timestamptz, phones int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  return query select p.id, p.app_installed_at, (select count(*)::int from public.push_subscriptions s where s.member_id = p.id)
    from public.profiles p where p.role = 'member';
end $$;
revoke all on function public.admin_setup_status() from public, anon;
grant execute on function public.admin_setup_status() to authenticated;

-- Tracker cover (migration ryl_32_tracker_cover)
create or replace function public.admin_set_tracker_cover(p_category uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only coaches can change trackers.' using errcode = '42501'; end if;
  update public.tracker_categories set cover_path = nullif(trim(coalesce(p_path, '')), '') where id = p_category;
  if not found then raise exception 'Tracker not found.' using errcode = 'P0002'; end if;
  perform public._audit('tracker.cover', 'tracker_categories', p_category::text, jsonb_build_object('cover', p_path));
end $$;
revoke all on function public.admin_set_tracker_cover(uuid, text) from public, anon;
grant execute on function public.admin_set_tracker_cover(uuid, text) to authenticated;

-- App time (migration ryl_33_app_time)
-- MEMBER: report time in the app. p_open = this report starts a new visit.
create or replace function public.log_app_time(p_seconds int, p_open boolean default false)
returns int language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); d date := public.app_today(); v_last timestamptz; v_add int; v_total int;
begin
  if v_uid is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  select max(last_at) into v_last from public.app_usage where member_id = v_uid;
  v_add := least(greatest(coalesce(p_seconds, 0), 0), 300,
                 case when v_last is null then 60 else greatest(0, ceil(extract(epoch from now() - v_last))::int + 5) end);
  insert into public.app_usage as u (member_id, day, seconds, opens, last_at)
  values (v_uid, d, v_add, case when p_open then 1 else 0 end, now())
  on conflict (member_id, day) do update
     set seconds = least(86400, u.seconds + excluded.seconds), opens = u.opens + excluded.opens, last_at = now()
  returning seconds into v_total;
  return v_total;
end $$;
revoke all on function public.log_app_time(int, boolean) from public, anon;
grant execute on function public.log_app_time(int, boolean) to authenticated;

-- MEMBER: my time today / this week (Mon–Sun) / last 7 days by day
create or replace function public.my_app_time()
returns jsonb language sql stable security definer set search_path = '' as $$
  with d as (select public.app_today() t)
  select jsonb_build_object(
    'today', coalesce((select seconds from public.app_usage, d where member_id = auth.uid() and day = d.t), 0),
    'week',  coalesce((select sum(seconds) from public.app_usage, d where member_id = auth.uid() and day between date_trunc('week', d.t)::date and d.t), 0),
    'days',  coalesce((select jsonb_object_agg(day, seconds) from public.app_usage, d where member_id = auth.uid() and day > d.t - 7), '{}'::jsonb));
$$;
revoke all on function public.my_app_time() from public, anon;
grant execute on function public.my_app_time() to authenticated;

-- COACH: everyone's time today, this week, average per day (last 7 days) and when they last used the app
create or replace function public.admin_app_time()
returns table(member_id uuid, today int, week int, avg7 int, days7 int, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare t date := public.app_today();
begin
  if not public.is_admin() then raise exception 'Coaches only.' using errcode = '42501'; end if;
  return query
  select p.id,
         coalesce((select u.seconds from public.app_usage u where u.member_id = p.id and u.day = t), 0),
         coalesce((select sum(u.seconds)::int from public.app_usage u where u.member_id = p.id and u.day between date_trunc('week', t)::date and t), 0),
         coalesce((select (sum(u.seconds) / 7)::int from public.app_usage u where u.member_id = p.id and u.day > t - 7), 0),
         (select count(*)::int from public.app_usage u where u.member_id = p.id and u.day > t - 7 and u.seconds >= 30),
         (select max(u.last_at) from public.app_usage u where u.member_id = p.id)
  from public.profiles p where p.role = 'member';
end $$;
revoke all on function public.admin_app_time() from public, anon;
grant execute on function public.admin_app_time() to authenticated;

-- Tracker Home poster (migration ryl_34_tracker_poster)
create or replace function public.admin_set_tracker_poster(p_category uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only coaches can change trackers.' using errcode = '42501'; end if;
  update public.tracker_categories set poster_path = nullif(trim(coalesce(p_path, '')), '') where id = p_category;
  if not found then raise exception 'Tracker not found.' using errcode = 'P0002'; end if;
  perform public._audit('tracker.poster', 'tracker_categories', p_category::text, jsonb_build_object('poster', p_path));
end $$;
revoke all on function public.admin_set_tracker_poster(uuid, text) from public, anon;
grant execute on function public.admin_set_tracker_poster(uuid, text) to authenticated;
