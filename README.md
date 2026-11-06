# Deepak's Redesign Your Life

**Small habits | Big transformation.** A life-transformation habit tracker with gamification for Deepak's coaching members.

- **4 trackers, 58 daily activities:** 16 Wealth Habits, 10 Conscious Habits, 16 Karma Activities and 16 Champion Mindsets.
- **One-tap check-in:** ✓ Done earns points instantly, ✗ Not done earns 0. There are never minus points.
- **Bonuses and badges:** daily, streak and perfect-week bonuses, plus 10 badges.
- **Live leaderboard:** daily, weekly, monthly and all-time.
- **Coach console:** check-in feed, special bonuses, removing fake ticks, CSV reports.
- **Private journal:** shared with the coach only if the member chooses.

**Stack:** HTML, CSS and vanilla JS · Supabase (Postgres, Auth, Storage, RLS) · Vercel · PWA

## Status
| Phase | | |
|---|---|---|
| 1 | Premium UI/UX design | ✅ `design-preview.html` (sample data) |
| 2 | Supabase database | ✅ live, see `supabase/` |
| 3 | Authentication & roles | ✅ login, register, forgot/reset, role guards, member & coach pages |
| 4–5 | Trackers & daily check-in | ✅ 4 tracker pages: ✓ / ✗ today, notes, week grid, month calendar, history |
| 6 | Coach tools | ✅ check-in feed with remove + reason, activity editor with image upload, special bonus |
| 7–8 | Scoring settings & leaderboard | ✅ super-admin point settings, monthly champion, podium leaderboard with recognitions |
| 9 | Journal, progress & reports | ✅ private journal, my progress (chart, trackers, badges, points history), coach reports + CSV, shared journals |
| 10–12 | PWA & Android install, security tests, deploy | planned |

## Folders
```
index.html            Landing page
login.html, register.html, forgot.html, reset.html
member/               dashboard.html, trackers.html, tracker-detail.html, leaderboard.html, journal.html, progress.html, profile.html
admin/                dashboard.html, checkins.html, members.html, activities.html, leaderboard.html, reports.html, settings.html
css/                  style.css, dashboard.css, admin.css, responsive.css
js/                   supabase.js, auth.js, ui.js, icons.js, dashboard.js, admin.js, auth-pages.js, stadium.js
js/vendor/            supabase-js 2.45.4 browser build (MIT)
design-preview.html   Phase 1 clickable design (SAMPLE data only)
image-prompts.html    AI prompts used for the 58 activity images
assets/images/        58 activity images (WebP, 640×480)
js/supabase.js        Supabase client (public anon key only)
supabase/             schema, functions, policies, seed, setup-all.sql, README
```

## Security
- Only the public anon key is in this repo. **Never commit the service_role key.**
- All data is protected by Row Level Security. See `supabase/README.md`.

## Run locally
Any static server works, for example `python3 -m http.server 8080`, then open http://localhost:8080.

## Supabase settings for Phase 3
- Authentication → URL Configuration → **Site URL**: your Vercel URL. Add `/login.html` and `/reset.html` under Redirect URLs.
- Authentication → Providers → Email: on. Keep "Confirm email" on for a closed group.
- First super admin (once, after the client signs up):
  `update public.profiles set role = 'super_admin' where id = (select id from auth.users where email = '<client email>');`
