# Redesign Your Life 2.0, Phase 4: My progress and Profile

Date: 6 Nov 2026. Scope: `member/progress.html` and `member/profile.html`, redesigned with the design system in both themes. No database changes. With this phase, every member page uses the 2.0 design.

## My progress
- Page header with "member since" and a one-line note that every number comes from the member's own ticks and points.
- **4 summary cards**, all server values:
  - total points, with rank;
  - current streak, with the longest streak from `get_my_streaks()`;
  - this week's %, with a bar;
  - this month's %, with a bar.
- **Points, last 30 days:**
  - The chart is drawn at the container's real pixel width, so the 12px axis labels stay readable from a 320px phone to a desktop, and it redraws on resize.
  - The y-axis labels sit on the left; today's bar is highlighted.
  - Chips show active days, the daily average and the best day.
  - The values come from the `score_history` ledger.
- **Trackers this month:** each tracker's icon and colour, % of possible ticks and number done.
- **Badges:** 3 per row on phones (2 below 340px). Earned medals show their glyph and date; locked ones show a lock and "Not yet".
- **Points history:** an icon for each kind (habit, all-done bonus, streak, perfect week, coach bonus), the date and a green "+pts" chip.

## Profile
- **Header card:** avatar, role pill, name, email and "member since", plus total points, streak and badges. These numbers load in the background from `get_my_dashboard()`, and the page works without them.
- **My details:** name and phone. It still sends only `full_name` and `phone`, and checks the phone before sending.
- **Appearance:** Light / Dark / Phone setting.
- **Change password.**
- **Links:** My progress, Journal and Leaderboard.
- **Log out.**
- Settings sections share a header style: icon tile and title.

## Also in this phase
- An empty install-card slot no longer adds a gap.
- Contrast: the header text on the profile's tinted background uses the stronger secondary colour (6.8:1 light).
- New `css/progress.css`. Service worker is now `ryl-v7`.

## Tests

| Suite | Result |
|---|---|
| New `run-p4`: progress and profile | 45/45 |
| Phases 1–3: `run-v2`, `run-p2`, `run-p3` | 104 + 53 + 72 |
| Earlier suites: trackers, auth, journal & progress, PWA, coach tools, leaderboard & settings | 36 + 44 + 22 + 16 + 23 + 23 |
| **Browser total** | **438/438**, with the CSP active and no console errors |
| SQL security and scoring | 52/52 (no database change since Phase 1) |

`run-p4` checks:
- the summary values against the server, and the chart total and chips against the ledger;
- tracker rows, badges and the history feed;
- profile stats and links, validation, the profile save sending only name and phone, and the weak-password refusal;
- 320 / 360 / 390 / 430 / 768 / 1280 px in both themes;
- text contrast in both themes (every measured pair ≥ 4.5:1).

**Unverified:** the live site on a real phone.

## Files
- **Changed:**
  - `js/journal.js` (progress part), `js/dashboard.js` (profile part)
  - `css/dashboard.css` (profile styles), `css/style.css`
  - `member/progress.html`, `sw.js`
- **Added:** `css/progress.css`, `docs/REDESIGN-2.0-PHASE-4.md`

## Still on v1 layouts
The coach console (7 pages) and the landing/login/register/forgot/reset pages. They already use the new colours, fonts and both themes.
