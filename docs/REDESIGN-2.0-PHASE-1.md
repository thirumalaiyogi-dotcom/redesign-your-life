# Redesign Your Life 2.0, Phase 1: Design System, Light/Dark and Home Dashboard

Date: 6 Nov 2026. Scope: the design system, both themes, the Home Dashboard and the bottom navigation. Other pages take the new tokens and both themes but keep their v1 layouts, as the brief asked ("Do not start redesigning all other pages in this phase").

## What was built

1. **Design system:** tokens, typography, 4px spacing, radius, shadows, motion and 15 component types. See `docs/DESIGN-SYSTEM.md`.
2. **Light mode (default) and Dark mode** from one set of tokens:
   - no flash on load;
   - the choice is saved per device;
   - "Phone setting" follows the system and switches live;
   - the toggle is on the Home header, with a three-way choice on Profile.
3. **Home Dashboard (`member/dashboard.html`, `js/dashboard.js`)**, all on live data:
   - **Header:** logo, time-of-day greeting with the member's first name, date, theme toggle, notification bell with unread count, avatar.
   - **Hero card:** animated ring for today's %, "N of 58 activities completed", today's points, streak, rank with movement, a message that changes with progress, and a "Continue today's habits" button.
   - **4 tracker cards:** each with its own colour and icon, a ring, a bar, done/total and a state (Not started / In progress / Complete). Each opens that tracker.
   - **Today's activities:** chips for each tracker and one-tap ✓ (done) and ✗ (not done) on each activity, with undo by tapping again.
     - States: not started / completed / not done / **locked** (a coach removed the tick).
     - The list shows 6 activities, with "Show all".
     - All 58 activities can be reached from Home.
   - **Streak & achievements:**
     - current streak and **longest streak** (new read-only function);
     - total points and badges earned;
     - the next streak milestone with a progress bar;
     - all 10 badges.
   - **This week:** Monday–Sunday completion bars from the member's own check-ins, the weekly % from the server, and a trend against last week. The trend appears only when last week has data; before the first full week the card says when the trend will start.
   - **Quick actions:** Journal, Activities, Ranks (leaderboard), Progress, Profile. All are working pages.
   - **Notifications sheet:** lists the member's own notifications (bonus, badge, removed tick, …) and marks them read.
4. **Bottom navigation:**
   - Home · Track · Leaderboard · Journal · Profile ("Ranks" below 380px);
   - floating bar with an active pill, safe areas for Android and iOS, and the same centred bar on desktop.
5. **Responsive layout:**
   - single column on phones;
   - 4 tracker cards across on tablets;
   - two columns on desktop, with a sticky side column.

## Backend change (one, additive, read-only)

**`public.get_my_streaks()`** (migration `ryl_13_v2_get_my_streaks`, also in `supabase/functions.sql` and `setup-all.sql`).

- **Why:** "Longest streak" was not available from any existing function. Working it out in the browser would mean downloading every check-in the member has ever made.
- **What it returns:** `{current, longest, min_daily}` for the caller only. It uses the same rule as the existing streak: a day counts when it has at least `streak_min_daily` done ticks that were not removed.
- **Security:** `SECURITY DEFINER`, `search_path = ''`, checks the login, not executable by `anon`. It writes nothing.
- **Tests:** SQL tests 51 and 52 (removed ticks ignored; anon refused).
- **No changes to:** tables, RLS policies, grants on tables, scoring, bonuses or badges.

## Testing report

| # | Test | Result | How |
|---|---|---|---|
| 1 | Login works | ✅ | browser test (simulated backend) |
| 2 | Registration works | ✅ | browser test `run-sub` (sign-up, duplicate email, validation) |
| 3 | Member data loads | ✅ | browser; **live** DB check as a real member (rolled back) |
| 4 | Home dashboard loads | ✅ | browser, 104 checks |
| 5 | All four trackers display | ✅ | browser + live (4 active trackers) |
| 6 | All activities accessible | ✅ | browser: 58/58 reachable from Home; live: 58 active |
| 7 | Check-in works | ✅ | browser: ✓, ✗, undo, double tap, network failure revert, locked |
| 8 | Points awarded correctly | ✅ | the client sends only `p_activity_id/p_status/p_note`, and all points come from the `mark_activity()` reply; SQL suite 52/52 |
| 9 | Streak calculation correct | ✅ | unchanged `_streak()`; new `get_my_streaks()` tested locally and live |
| 10 | Leaderboard functional | ✅ | browser `run78` 23/23, both themes |
| 11 | Journal functional | ✅ | browser `run9` 22/22, both themes |
| 12 | Light mode | ✅ | browser: colours and contrast measured (Phase 2 fixed a contrast-measuring bug in the test and darkened light secondary text to #67716A to pass AA) |
| 13 | Dark mode | ✅ | browser: colours and contrast measured on every member page |
| 14 | Theme persists | ✅ | reload and other pages; no flash (theme set before `<body>` exists) |
| 15 | Bottom nav works | ✅ | 5 items, active state, no dead links (all 200) |
| 16 | Mobile layout | ✅ | 320/360/390/430/768/1280 × both themes: no sideways scroll, nothing off-screen, no clipped labels, nav items don't overlap |
| 17 | PWA install | ✅ (browser) | `run10` 16/16: manifest, service worker v4, offline page, install card. **Install on a real Android phone: unverified** |
| 18 | No console errors | ✅ | all suites run with the CSP active; zero errors or CSP violations |
| 19 | No broken queries | ✅ | browser + live check of every new query as a member (rolled back) |
| 20 | No security regressions | ✅ | SQL 52/52; live: a member sees only their own notifications and check-ins and can change only `read_at`; Supabase advisor shows no new kinds of warning |

**Totals:** 268/268 browser checks across 7 suites (new `run-v2` 104, auth 44, trackers 36, coach 23, leaderboard 23, journal 22, PWA 16) and 52/52 SQL checks.

**Unverified (no access from the build environment):** loading the published site on GitHub Pages and a real phone, a real login against live Supabase Auth, and the Android install prompt. Browser tests use a simulated Supabase that follows the real API; live database checks were run directly on the database and rolled back.

## Modified files

**New:**
- `css/tokens.css`, `css/components.css`
- `js/theme-init.js`, `js/theme.js`
- `docs/DESIGN-SYSTEM.md`, `docs/REDESIGN-2.0-PHASE-1.md`

**Rewritten:**
- `css/style.css` (now token-based)
- `css/dashboard.css`
- `js/dashboard.js` (Home + Profile with the Appearance picker)

**Updated:**
- `css/tracker.css`, `css/leaderboard.css`, `css/admin.css`: hardcoded colours replaced with tokens, heading sizes for the new font.
- `js/ui.js`: new bottom nav.
- `js/journal.js`, `js/tracker.js`: inline chart and legend colours now use tokens.
- `js/stadium.js`: green brand art.
- `js/pwa.js`: re-checks the install slot after a re-render.
- `index.html`: landing hero colours and typography.
- `offline.html`, `404.html`: both themes.
- All 19 app pages: theme-init script, `tokens.css`, new fonts, theme-color.
- `member/dashboard.html`, `member/profile.html`: `components.css`.
- `manifest.json` (colours), `assets/icons/*` (green/gold icons), `sw.js` (v4, new files cached).
- `supabase/functions.sql`, `supabase/setup-all.sql` (regenerated from the four files; tested to run twice cleanly).

## Existing features preserved

- **Accounts and roles:** login, register, forgot/reset password, "keep me logged in", role guards (member / coach / super admin), paused accounts.
- **Trackers and scoring:**
  - 4 trackers and 58 activities with unchanged names, images, descriptions and points;
  - ✓ / ✗ marking only through `mark_activity()`, today only, never minus points;
  - notes, week / month / history views;
  - daily, streak-7 and perfect-week bonuses; 10 badges; the streak rule.
- **Leaderboard:** 4 periods, podium, tie-break order, movement, recognitions.
- **Journal:** private journal with optional sharing; My progress chart and points history.
- **Coach console:** overview, check-in feed and removing ticks, members (bonus, pause, roles), activity editor with image upload, settings, monthly champion, reports and CSV export, shared journals.
- **Security:** RLS on all 11 tables, column grants, the audit log, the strict CSP (no inline scripts), clickjacking guard, only the anon key in the code.
- **PWA:** manifest, service worker (never caches Supabase data), offline screen, install card.

## Unresolved issues and notes

1. **Other pages are re-themed but not yet redesigned:** trackers, tracker detail, leaderboard, journal, progress, coach console, auth pages. They use the new colours, fonts and both themes, and keep their v1 layouts. This is planned for the next phases.
2. **Theme choice is saved per device**, not per account. A member who uses two phones sets it on each. Saving it in the database would need a schema change, which was out of scope.
3. **No notifications are sent yet for daily reminders.** The bell shows what the database already creates (bonuses, badges, removed ticks).
4. **The live site and a real phone have not been checked**; see the Unverified note above. After this deploys, open the app on a phone and confirm the theme toggle, ticking, and the install card.
5. **Supabase dashboard settings still recommended** (from SECURITY.md): minimum password length 8. Leaked-password protection needs the Pro plan.
6. **Old copies on phones:** the service worker version is bumped to `ryl-v4`, so installed apps fetch the new design on the next open (network first). A phone that is offline keeps the cached v1 until it reconnects.
