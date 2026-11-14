-- =====================================================================
-- Phone notifications: run AFTER schema/functions/policies, once Edge Function
-- "send-push" is deployed with secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
-- Needs the pg_cron and pg_net extensions (Supabase: Database → Extensions).
--
-- How it works
--   * Anything that creates an in-app notification (coach answer, bonus, badge, new session,
--     reminders below) also asks send-push to deliver it to the member's phone(s).
--   * send-push only sends rows of public.notifications that are not pushed yet, then marks
--     them, so calling it twice never sends twice. It needs no secret from the database.
-- =====================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- after any new notifications, wake send-push (async; never blocks or fails the insert)
create or replace function public._wake_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://gcbizlnpryihrrmjwbdv.supabase.co/functions/v1/send-push',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 5000);
  return null;
exception when others then
  return null;   -- notifications still show in the app even if push is down
end; $$;
revoke execute on function public._wake_push() from public, anon, authenticated;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each statement execute function public._wake_push();

-- daily reminders (times in UTC: 14:30 UTC = 8:00 pm IST, 01:30 UTC = 7:00 am IST)
select cron.unschedule(jobname) from cron.job where jobname in ('ryl-evening-reminder', 'ryl-todo-reminder', 'ryl-push-catchup');
select cron.schedule('ryl-evening-reminder', '30 14 * * *', $$select public._queue_daily_reminders()$$);
select cron.schedule('ryl-todo-reminder',    '30 1 * * *',  $$select public._queue_todo_reminders()$$);
-- safety net: retry anything not delivered (e.g. a phone was offline)
select cron.schedule('ryl-push-catchup', '*/30 * * * *', $$select net.http_post(url := 'https://gcbizlnpryihrrmjwbdv.supabase.co/functions/v1/send-push', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$$);
