# Security review: Phase 11 (6 Nov 2026)

Scope: the Supabase project `gcbizlnpryihrrmjwbdv` (database, auth, storage) and the web app in this repo.
Method: a permission audit of the live database, attack tests run as a real member account on the live database (rolled back afterwards), a local SQL test suite, a frontend code review, and browser tests.

## Result

| Area | Result |
|---|---|
| Live attack test (member account) | **62 of 62 attempts blocked** |
| Local SQL security & scoring suite | **55 of 55 pass** (incl. coach progress functions: members and visitors refused) |
| Browser suites (auth, trackers, coach tools, leaderboard, journal, PWA, 2.0 dashboard & themes) | **633 of 633 pass** (2.0 + coach content + per-member progress), with the CSP active and no violations |
| Injected script, `onerror` XSS, outside image | all refused by the CSP |
| App loaded inside another site's frame | hides itself |

## What the attack test tried (all blocked)
- Insert into or delete from all 10 non-journal tables directly.
- Change own role, active status or join date; change check-in status, score points, activity points or names, app settings; move a journal or notification to another member.
- Read another member's check-ins, scores, journal, profile or phone; read the audit log.
- Write a journal entry as someone else.
- Call every coach or super-admin function: overview, people list, check-in feed, report, bonus, role change, pause, settings, close month, remove a tick.
- Call internal helpers directly (award a badge, recalculate bonuses, send a notification, read stats).
- Mark an activity that does not exist.
- Upload into the activity-images bucket, or into another member's avatar folder.
- As a logged-out visitor: read any table, or the leaderboard.

## Controls in place
- **Row Level Security on all 11 tables.** Members see only their own rows. Coaches see members' data, but journals only when the member shares them.
- **No direct writes to scores or check-ins.** They change only through `mark_activity()` (today only, one row per activity per day, never negative points) and the coach functions.
- **Column-level grants.** Members can edit only their own name, phone and avatar, never their role or status. Coaches can edit only an activity's description, image, points and visibility; names and numbers are locked by a trigger.
- **21 `SECURITY DEFINER` functions** (2.0 added the read-only `get_my_streaks()` for members, and the read-only coach-only `admin_day_summary()` and `admin_member_checkins()` for the per-member progress view). Each checks the caller's role first and pins `search_path = ''`. Nothing is executable by `anon`. Supabase's advisor lists these as "callable by signed-in users"; that's intended, because each one enforces its own role check.
- **Audit log** of every coach and admin action.
- **Images** are limited by database constraints to the app's own files or this project's storage, so no tracking pixels or outside links.
- **Frontend.** All user text is HTML-escaped. There are no inline scripts or inline event handlers. A strict Content-Security-Policy is set (meta tag on every page; also a header on Vercel). Logins redirect only to same-site paths. CSV export guards against formula injection. A clickjacking guard is on. Only the public anon key is in the code.
- **Service worker** caches only the public app shell, never Supabase responses or member data.

## Settings to change in the Supabase dashboard (cannot be set from code)
1. **Authentication → Providers → Email → Minimum password length: 8.** The app asks for 8, but the API default is 6.
2. **Authentication → Attack Protection → Leaked password protection.** Needs the Pro plan; turn it on if the project upgrades.
3. Keep **Confirm email** on. Custom SMTP (Brevo) is already set.
4. After buying a domain: verify it in Brevo (DKIM/DMARC) so emails stop landing in spam, and add the new URL to Authentication → URL Configuration.

## Known trade-offs (accepted)
- **Sign-up can confirm that an email is already registered** ("log in instead"). This is acceptable for a closed coaching group. Password reset does not reveal whether an account exists.
- **Members see each other's names and points on the leaderboard.** They agree to this at sign-up.
- **A super admin can change another super admin's role** (but not their own). Keep the number of super admins small.
