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
    from public._period_stats(ps, pe) pp)
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
  if found then v := v || jsonb_build_object('most_consistent', jsonb_build_object('name', r.full_name, 'detail', r.consistency || '% this week')); end if;

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

-- ---------------------------------------------------------------------
-- Execute permissions: nothing is callable by default
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.app_today(), public.my_role(), public.is_admin(), public.is_super_admin(),
  public.mark_activity(uuid, text, text), public.get_my_dashboard(),
  public.get_leaderboard(text, date), public.get_recognitions(date),
  public.admin_void_checkin(uuid, text), public.admin_award_bonus(uuid, int, text),
  public.admin_set_role(uuid, text), public.admin_set_active(uuid, boolean),
  public.admin_update_setting(text, jsonb), public.admin_close_month(date),
  public.admin_overview(date), public.admin_member_report(date, date), public.admin_list_people()
to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
