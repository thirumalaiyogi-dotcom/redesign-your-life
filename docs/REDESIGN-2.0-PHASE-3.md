# Redesign Your Life 2.0, Phase 3: Leaderboard and Journal

Date: 6 Nov 2026. Scope: `member/leaderboard.html` (and the coach's `admin/leaderboard.html`, which uses the same code) and `member/journal.html`, redesigned with the design system in both themes. No database changes.

## Leaderboard
- Shared member header (theme toggle, avatar). A page header with a pulsing "Live" dot and a one-line rule.
- Period tabs (Today / This week / This month / All time) in a full-width segmented control with equal widths. The choice is still remembered for the session.
- **Your rank card** (new; shown at the top for every rank): rank, movement, points, ticks done, consistency, streak, and the gap to the next place.
  - The gap reads "N pts behind #3", "Level on points with #3. Consistency decides", or "You're on top".
  - It is worked out only from the rows `get_leaderboard()` returns, so no new data is involved.
- **Podium:** gold, silver and bronze rings around the avatars, with points and a softer block style.
- **List from #4 down:** rank, avatar, name, meta, points and movement chips (up / down / new). Your own row is highlighted, and long names are cut off with "…".
- **Recognitions:** 5 cards with icon tiles. Ones nobody has earned yet are dimmed and read "Not yet".
- **Tie-break rule:** shown as a hint line.
- **Coach view:** the same podium, list and recognitions under the coach console header, with no "your rank" card.

## Journal
- Page header with a Today / Yesterday segmented control (the rules are unchanged: only today and yesterday can be written).
- **Entry card:**
  - the date, "Saved just now / N min ago", and a live "N of 5 answered" progress bar;
  - five question blocks, each with its own icon, "Question N" label and a roomy text box;
  - a **Share with my coach** switch row: the whole row is tappable, it is still a real checkbox, and it is on by default as before;
  - a privacy note and a full-width Save button.
- **Past entries:** cards showing the date, a preview of the first answer, a Shared/Private pill and "N/5" answered. They expand to show the full entry.
- Saving is unchanged: insert for a new day, update for an existing day, through the same RLS rules. Empty entries are refused with a clear message.

## Shared changes
- The member header (`.dash-top`) and `.hint-line` moved into `components.css`, so every member page has the same header. `components.css` is now loaded on all 7 member pages and on the coach leaderboard.
- The My progress page also gets the new header and theme toggle; its layout is next.
- New `css/journal.css`. Service worker is now `ryl-v6`.

## Tests

| Suite | Result |
|---|---|
| New `run-p3`: Leaderboard and Journal | 72/72 |
| Phase 2 (`run-p2`), Phase 1 (`run-v2`) | 53/53, 104/104 |
| Earlier suites: trackers, auth, journal & progress, PWA, coach tools, leaderboard & settings | 36 + 44 + 22 + 16 + 23 + 23 |
| **Browser total** | **393/393**, with the CSP active and no console errors |

`run-p3` covers:
- period switching (asks the server for the right period);
- the rank card and gap for #4 and for #1;
- podium order, movement chips, long-name truncation, recognitions, and the empty state;
- the journal: progress count, switch, insert then update (same entry), and the private flag sent;
- past-entry preview, Yesterday, and refusing an empty save;
- 320 / 360 / 390 / 430 / 768 / 1280 px in both themes, for Leaderboard, Journal and Progress;
- contrast in both themes: every measured text ≥ 4.5:1, answer text ≥ 13:1.

**Unverified:** the live site on a real phone.

## Files
- **Changed:**
  - `js/leaderboard.js`, `js/journal.js`
  - `css/leaderboard.css` (leaderboard part rewritten; coach settings styles unchanged), `css/components.css`, `css/dashboard.css`, `css/tracker.css`
  - `member/leaderboard.html`, `member/journal.html`, `member/progress.html`, `admin/leaderboard.html`
  - `sw.js`
- **Added:** `css/journal.css`, `docs/REDESIGN-2.0-PHASE-3.md`

## Still on v1 layouts
My progress, the Profile layout, the coach console and the auth/landing pages. They already have the new colours, fonts and both themes.
