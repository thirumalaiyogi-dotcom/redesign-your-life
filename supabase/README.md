# Phase 2: Supabase setup

Project: `redesign-your-life`, `gcbizlnpryihrrmjwbdv` (https://gcbizlnpryihrrmjwbdv.supabase.co), Mumbai region.

**Already applied** on 6 Nov 2026 as migrations `ryl_01_schema`, `ryl_02a_helpers`, `ryl_02b_scoring`, `ryl_02c_admin`, `ryl_03_security` and `ryl_04_seed`, and verified with a live rolled-back test. Step 1 below is only needed to rebuild the database somewhere else.

## 1. Create the database (5 minutes)
1. Open Supabase → your project → **SQL Editor** → **New query**.
2. Paste the whole of `setup-all.sql` and press **Run**.
   You should see "Success. No rows returned". It is safe to run again.
3. Check: **Table Editor** shows 11 tables. `activities` has 58 rows and `achievements` has 10.

The four separate files (`schema.sql → functions.sql → policies.sql → seed.sql`) contain the same SQL, split up for version control.

## 2. Turn on email login
Authentication → Providers → **Email**: enabled.
For a closed coaching group, you can switch off "Allow new users to sign up" and invite members from Authentication → Users → **Invite**.

## 3. Make the client the super admin
1. Sign up once with the client's email (from the app in Phase 3, or Authentication → Users → Add user).
2. In SQL Editor, run (with the real email):
   ```sql
   update public.profiles set role = 'super_admin'
   where id = (select id from auth.users where email = 'deepak@example.com');
   ```
   This is the only time a role is set by hand. After this, the super admin promotes coaches from the app.

## How scoring works
| Action | Points |
|---|---|
| ✓ Done (today only) | +10 per activity, instantly |
| ✗ Not done, or not marked | 0 (never negative) |
| All 58 done in one day | +20 |
| Every 7th day of an unbroken streak | +30 |
| Every activity, every day, Mon–Sun | +50 (on Sunday) |
| Coach special bonus | 1–500, with a reason |
| Coach removes a fake tick | that tick's points and any bonus it earned are removed, and the member is notified |

The super admin can change the bonus values in `app_settings`. Each activity's own points can be changed in the `activities` table.

## Security summary
- RLS is on for every table. Members read only their own check-ins, scores, badges, journal and notifications.
- Members never write check-ins or scores directly. They do it only through `mark_activity()`, which works for today only.
- Members cannot change their role or active status, because column-level grants block it.
- Activity names and numbers are locked, even for admins. Description, image, points and visibility can be edited.
- The journal is private. A coach sees an entry only if the member left "share with coach" on.
- Every admin action is written to `audit_logs`.
- Only the anon key is used in the app. The service_role key must never be put in frontend code.

Tested locally on PostgreSQL 16 with 43 automated checks: role escalation, data isolation, double taps, bonuses, voids, journal privacy, logged-out access and deactivated members.
