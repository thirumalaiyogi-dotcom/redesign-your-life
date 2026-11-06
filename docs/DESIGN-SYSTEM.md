# Redesign Your Life 2.0 — Design System

One design system with two themes. Components use **semantic tokens only**, so every component works in Light and Dark without a second design.

## Files (CSS architecture)

| File | Holds | Loaded on |
|---|---|---|
| `css/tokens.css` | Colour, type, spacing, radius, shadow, motion tokens for both themes; legacy v1 aliases | every page, first |
| `css/style.css` | Base elements and shared components (buttons, forms, notices, panels, pills, avatar, tabs, toast, dialog, bottom nav, skeleton, empty state, auth pages) | every page |
| `css/components.css` | 2.0 components: card, section header, stat, progress ring, progress bar, tracker card, filter chips, activity row, check buttons, badges, quick actions, bottom sheet, notification list, theme toggle/picker | Home and Profile (other pages adopt them in later phases) |
| `css/dashboard.css` | Home Dashboard layout, plus shared member blocks (KPI tiles, tracker art cards, badge grid, profile) | member pages |
| `css/tracker.css`, `leaderboard.css`, `admin.css`, `responsive.css` | Page styles, now token-based | their pages |
| `js/theme-init.js` | Sets the theme before first paint (no flash) | every page, in `<head>` |
| `js/theme.js` | `toggleTheme()`, `setThemePref()`, `getThemePref()`, `currentTheme()` | Home, Profile |

## Theme

- **Light is the default.** Dark is optional. "Phone setting" (system) follows the phone and switches live.
- Saved per device in `localStorage["ryl.theme"]` = `light | dark | system`. This is a viewing preference only, so it is not stored in the database.
- `theme-init.js` runs synchronously in `<head>` and sets `<html data-theme="light|dark">` and `meta[name=theme-color]` before the body exists, so there is no flash. It is an external file because the CSP forbids inline scripts.
- Toggle: the sun/moon button on the Home header. Three-way choice (Light / Dark / Phone setting) on Profile → Appearance.
- `offline.html` and `404.html` are self-contained and read the same saved theme.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-bg` | #F7F8F5 | #101713 | page background |
| `--c-surface` | #FFFFFF | #19231D | cards |
| `--c-elevated` | #FFFFFF | #202D25 | raised surfaces |
| `--c-sunken` | #F0F3EE | #141D18 | wells, inputs, tracks |
| `--c-primary` | #173F35 | #83C5A2 | primary actions, active nav, links |
| `--c-primary-light` | #E2EEE8 | #274436 | soft fills, active pill |
| `--c-secondary` | #DDEBE4 | #22372C | secondary fills |
| `--c-accent` | #D5AD62 | #D9B66F | gold: points, ranks, rewards |
| `--c-accent-ink` | #8A6520 | #E6C98C | gold used as text (meets AA) |
| `--c-success` | #229B72 | #56C995 | done |
| `--c-warning` | #E5A447 | #E9B65C | removed by coach |
| `--c-danger` | #D95C5C | #F07878 | not done, errors |
| `--c-text` | #202923 | #F2F6F2 | main text |
| `--c-muted` | #67716A* | #A2B0A7 | secondary text |
| `--c-border` | #E8ECE8 | #2D3A32 | borders |
| `--t-wealth / conscious / karma / champion` | tuned per theme | tuned per theme | tracker identities |

The palette values given in the brief are used as is, with one exception: *secondary text in Light mode is #67716A instead of #737D76, because #737D76 measures only 4.26:1 on white and 4.0:1 on the page background, below the WCAG AA minimum of 4.5:1 for small text; #67716A measures 5.06:1 and 4.75:1 and looks almost the same. The extra tokens (`-ink`, `sunken`, `track`, `streak`, `hero-*`) exist so text stays readable: gold #D5AD62 is too light for text on white, so text uses `--c-accent-ink`.

Measured contrast (browser tests): body text 14.0:1 light and 14.0:1 dark; card titles 14.2:1 light and 13.5:1 dark; secondary text ≥ 4.75:1 on every light surface and ≥ 7:1 in dark.

**Legacy aliases.** v1 names (`--bg`, `--surface`, `--ink`, `--muted`, `--gold`, `--gold-hi`, `--ok`, `--bad`, …) now point at these tokens, so pages not yet redesigned still follow both themes. `.btn-gold` is now the primary (green) button, with `.btn-primary` as its alias.

## Typography

- **Plus Jakarta Sans** (`--f-display`): headings, statistics. **Inter** (`--f-body`): everything else.

| Role | Token | Size |
|---|---|---|
| Dashboard greeting | `--fs-greeting` | clamp(24px, 6.4vw, 30px), 800 |
| Page heading | `--fs-page` | clamp(24px, 6vw, 32px) |
| Section heading | `--fs-section` | 18px, 750 |
| Card heading | `--fs-card` | 15.5px |
| Body | `--fs-body` | 15px / 1.5 |
| Secondary | `--fs-small` | 13px |
| Label | `--fs-label` | 11.5px |
| Statistic | `--fs-stat` / `--fs-stat-xl` | clamp(26–34px) / clamp(40–52px) |

## Spacing, radius, elevation, motion

- **Spacing (4px scale):** `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 20 · `--s-6` 24 · `--s-8` 32 · `--s-10` 40 · `--s-12` 48 · `--s-16` 64
- **Radius:** `--r-xs` 6 · `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-xl` 28 · `--r-pill`
- **Shadows:** `--shadow-1` (resting), `--shadow-2` (hover), `--shadow-3` (floating: hero, nav, sheets). Dark mode uses deeper, neutral shadows.
- **Motion:** `--ease` cubic-bezier(.2,.8,.2,1); `--t-fast` .15s, `--t-med` .28s, `--t-slow` .8s (rings and bars). All motion is off under `prefers-reduced-motion`.

## Components

| Component | Class | Notes |
|---|---|---|
| Buttons | `.btn` + `.btn-primary` (= `.btn-gold`), `.btn-accent`, `.btn-soft`, `.btn-ghost`, `.btn-ok`, `.btn-bad`, `.btn-sm`, `.btn-block` | press scale .97, busy state |
| Icon button | `.iconbtn` (+ `.count` badge) | 42×42 touch target |
| Card | `.card`, `.card-pad`, `.card-h` (v1 `.panel` still works) | |
| Section header | `.sec-h` with `h2` and a link | |
| Statistic | `.stat` (`small` label + `b` value), `.mini-stats`, `.hero-stats` | |
| Progress ring | `.pring` (SVG; `--size`, `--ring-fg`, `--ring-bg`) | animates from 0 |
| Progress bar | `.pbar > i` (`--bar`) | animates width |
| Tracker card | `.tk` (`--tc` colour, icon, ring, bar, state chip) | Complete / In progress / Not started |
| Activity row | `.arow` with `.cbtn.ok` ✓ and `.cbtn.no` ✗ | states `.is-done`, `.is-miss`, `.is-locked` |
| Filter chips | `.chip-row > .fchip[aria-pressed]` | horizontal scroll |
| Badges | `.bdg` (`--from`/`--to`), `.locked` | |
| Quick actions | `.qa-grid > .qa` | |
| Navigation | `.bottomnav` (floating, safe-area aware), `.admin-nav` | |
| Modal | `.scrim > .dialog` (`confirmDialog()` in ui.js) | |
| Bottom sheet | `.sheet-scrim > .sheet` (`openSheet()` in dashboard.js) | centred card on ≥600px |
| Toast | `toast(msg, 'ok'/'bad'/'info')` | same dark style in both themes |
| Empty state | `.empty-state` | |
| Skeleton | `.skeleton`, `.sk-line`, `.sk-circle` | shimmer |
| Theme toggle / picker | `.theme-btn`, `.theme-pick` | |

## Breakpoints

Phone first. Tested at 320, 360, 390, 430, 768 (tablet) and 1280 (desktop).
- ≤340px: hero ring stacks above the text; quick actions use 3 columns.
- ≤379px: the "Leaderboard" nav label becomes "Ranks".
- ≤400px: compact hero, header shows the crest only.
- ≥720px: tracker cards in 4 columns.
- ≥980px: two-column dashboard (main + sticky side column).
