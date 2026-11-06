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
| 3 | Authentication & roles | next |
| 4–12 | Trackers, scoring UI, leaderboard, analytics, PWA, security tests, deploy | planned |

## Folders
```
design-preview.html   Phase 1 clickable design (SAMPLE data only)
image-prompts.html    AI prompts used for the 58 activity images
assets/images/        58 activity images (WebP, 640×480)
js/supabase.js        Supabase client (public anon key only)
supabase/             schema, functions, policies, seed, setup-all.sql, README
```

## Security
- Only the public anon key is in this repo. **Never commit the service_role key.**
- All data is protected by Row Level Security. See `supabase/README.md`.
