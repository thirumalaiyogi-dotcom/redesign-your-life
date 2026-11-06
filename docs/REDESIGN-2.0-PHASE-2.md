# Redesign Your Life 2.0, Phase 2: Track page and tracker pages

Date: 6 Nov 2026. Scope: `member/trackers.html` (Track) and `member/tracker-detail.html` (the 4 tracker pages), redesigned with the Phase 1 design system in both themes. No database changes.

## What changed

**Track (tracker list)**
- Page header with the date, plus the shared member header (logo, theme toggle, avatar).
- Today summary card: a ring, "N of 58 done today", done / not done / to mark, and today's points. All values come from `get_my_dashboard()`.
- New tracker cards, each with:
  - a cover image, the tracker's icon and colour;
  - a ring, a progress bar and a state (Not started / In progress / Complete);
  - done / not done / to mark counts.
- Layout: one card per row on phones (image on the left), 2 per row on tablets, 4 on desktop.

**Tracker detail**
- Photo header showing the tracker's cover, colour and icon, with breadcrumbs (Home › Track), the number of activities and the tagline. Below it, a chip switcher for the four trackers.
- Sticky "today" bar: ring, done count, points.
- Activity cards, each with:
  - the number pill, a ✓ stamp when done, and a points tag (+10 / 0);
  - a 7-day strip and ✓ Done / ✗ Not done buttons.
- The note footer appears only after an activity is marked ("Add note" / "Edit note"). A coach-removed tick shows as a locked card with the reason.
- Week / Month / History views, week navigation, legend and the note dialog all restyled with tokens.

**Shared (also used by Home and Profile)**
- `ui.js` now holds `ringHTML`, `animateIn`, `setRing`, `avatarHTML` and `memberTopbar`. The duplicate copies were removed from `dashboard.js`.
- The theme toggle is in the header of Home, Track, the tracker pages and Profile. On Profile, the Appearance picker updates when the header toggle is used.
- New `.page-h` page-header component.

## Accessibility fix found in this phase
The Phase 1 contrast test read `color(srgb …)` values incorrectly, so it over-reported contrast on tinted cards. With the measurement fixed:
- The brief's light secondary-text colour **#737D76 measures 4.26:1 on white and 4.0:1 on the page background**. That is below the WCAG AA minimum of 4.5:1, so `--c-muted` (light) is now **#67716A** (5.06:1 / 4.75:1). It looks almost the same.
- Text on green-tinted "done" rows and cards now uses the stronger secondary colour.

## Preserved (unchanged behaviour)
- Marking goes only through `mark_activity()`: today only, ✓ = points from the server, ✗ = 0 points, tap again to undo.
- The double-tap guard, revert on network failure, and the "new day" reload all still work.
- Notes, the coach-removed (locked) state, past weeks view-only, Month calendar, History list, and unknown-tracker message all still work.
- All 58 activity names, images, descriptions and points are unchanged.

## Tests

| Suite | Result |
|---|---|
| New `run-p2`: Track + tracker pages | 53/53 |
| Phase 1 dashboard and themes (`run-v2`) | 104/104 |
| Trackers v1 behaviour (`run4`) | 36/36 |
| Auth, coach, leaderboard, journal, PWA | 44 + 23 + 23 + 22 + 16 |
| **Browser total** | **321/321**, with the CSP active and no console errors |
| SQL security and scoring | 52/52 |

The Phase 2 suite covered:
- server data on Track;
- marking, the today ring, notes, the locked card, Month and History;
- the theme toggle on these pages, and the Profile picker staying in step;
- 320 / 360 / 390 / 430 / 768 / 1280 px in both themes, with no sideways scroll, nothing off-screen, no clipped text and no header overlap;
- contrast in both themes: card titles ≥ 13.5:1, day labels ≥ 7.7:1.

**Unverified:** the live site on a real phone (no access from the build environment).

## Files
- **Changed:**
  - `js/tracker.js`, `js/ui.js`, `js/dashboard.js`
  - `css/tracker.css` (rewritten), `css/components.css`, `css/dashboard.css` (old tracker-card styles removed), `css/style.css`, `css/tokens.css` (`--c-muted` light)
  - `member/trackers.html`, `member/tracker-detail.html` (`components.css`)
  - `sw.js` (`ryl-v5`)
  - `docs/DESIGN-SYSTEM.md`
- **Added:** `docs/REDESIGN-2.0-PHASE-2.md`

## Still on v1 layouts (next phases)
Leaderboard, Journal, My progress, Profile layout, the coach console and the auth pages. They already use the new colours, fonts and both themes.
