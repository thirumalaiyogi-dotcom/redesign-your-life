# Redesign Your Life 2.0, Phase 5: Coach console

Date: 6 Nov 2026. Scope: all 7 coach pages (Overview, Check-ins, Members, Activities, Leaderboard, Reports, Settings), redesigned with the design system in both themes. No database changes; every coach action still goes through the same role-checked database functions.

## What changed

**Header and menu (all 7 pages)**
- **Shared coach header:** Coach Console logo, role pill (Coach / Super Admin), the same ☀️/🌙 theme toggle as members, and Log out.
- **Menu:** a segmented bar with an icon for each page and a highlighted current page.
  - **Phones:** the bar scrolls sideways, fades at the edge to show there is more, and centres the current page.
  - **Desktop:** the seven items share the full width.

**Overview**
- **"Today" banner:** a ring showing the % of members active, "36 of 48 members ticked today", habits done and the weekly average, plus a link to the members who are not active yet. When everyone has ticked, it shows a green "Everyone has ticked today" instead.
- **Six KPI cards with icons:**
  - "Not active today" is highlighted in amber when it is above zero.
  - Points are shown in gold.
- **Latest check-ins:** Done / Not done / Removed pills.
- **Category completion:** a coloured dot for each tracker.

**Check-ins, Members, Activities**
- Card rows; check-ins and activities carry a tracker-colour stripe.
  - Check-ins show a green "+10" points chip.
  - Paused and removed items are dimmed but stay readable.
- Filter chips with counts (selected = dark pill), search box with a focus ring, and date inputs use tokens.
- "Email not confirmed" now uses the readable amber text colour.
- Role select, Bonus, Pause/Activate, Remove (with a reason), the activity editor and image upload are all unchanged.

**Reports and Settings**
- **Reports:**
  - Report table with a tinted header and row hover.
  - Points shown in gold.
  - CSV download and shared journals are unchanged.
- **Settings:** the layout no longer overflows on a 320px phone (it was 14px too wide).

## Tests

| Suite | Result |
|---|---|
| New `run-p5`: coach console | 78/78 |
| Earlier coach suites: tools, overview/members/auth, reports, leaderboard & settings | 23 + 44 + 22 + 23 |
| Member suites: Phases 1–4, trackers, PWA | 104 + 53 + 72 + 45 + 36 + 16 |
| **Browser total** | **516/516**, with the CSP active and no console errors |
| SQL security and scoring | 52/52 (no database change since Phase 1) |

`run-p5` checks:
- the header, menu and no dead links;
- the Overview numbers;
- Check-ins: the tracker filter is sent to the server;
- Members:
  - super-admin controls; no role select on your own row;
  - search, and the bonus dialog;
- the 16 Wealth activities;
- the coach leaderboard has no "your rank" card;
- Reports: table, CSV and shared journal;
- Settings: Save stays disabled until something changes;
- the theme toggle;
- all 7 pages at 320 / 390 / 768 / 1280 px in both themes: no sideways scroll, nothing off-screen, no clipping, no header overlap;
- text contrast in both themes.

**Unverified:** the live site on a real phone or laptop.

## Files
- **Changed:**
  - `js/ui.js` (`adminNav` markup, new `coachTopbar`), `js/admin.js`, `js/leaderboard.js` (coach header)
  - `css/admin.css` (rewritten), `css/leaderboard.css` (settings grid)
  - all 7 `admin/*.html` (`components.css`)
  - `sw.js` (`ryl-v8`)
- **Added:** `docs/REDESIGN-2.0-PHASE-5.md`

## Still on v1 layouts
Landing, login, register, forgot and reset pages. They already use the new colours, fonts and both themes.
