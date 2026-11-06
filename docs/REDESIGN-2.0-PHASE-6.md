# Redesign Your Life 2.0, Phase 6: Landing and sign-in pages (final phase)

Date: 6 Nov 2026. Scope: `index.html` (landing), `login.html`, `register.html`, `forgot.html` and `reset.html`. No database or auth-logic changes. With this phase, every page in the app uses the 2.0 design system in both themes.

## Landing
- **Hero (deep-green brand panel; looks the same in both themes):**
  - eyebrow badge;
  - large headline;
  - tagline;
  - intro text;
  - gold "Join the program" and outlined "Member login" buttons;
  - a stats strip: 58 daily habits · 4 trackers · 10 badges · 0 minus points;
  - a theme toggle next to Log in.
- **Sections:** each opens with an eyebrow, a heading and a short line.
  - The daily loop: 4 step cards.
  - Four trackers: picture cards.
  - Why it works: 3 feature cards.
- **Closing banner:** "Ready for day 1?" with a Join button.
- Styles moved out of the page into `css/landing.css`.
- Signed-in visitors still get "Open my dashboard".

## Login, Register, Forgot and Reset
- **Brand art panel:** a deep-green brand panel with the quote. On desktop it also lists three highlights (instant points; streaks, badges and leaderboard; private journal).
- **Form:**
  - on desktop it sits in a raised card;
  - on phones it is full-width with no card, under a short art banner;
  - larger primary button.
- **Theme toggle:**
  - on every sign-in screen: top-right of the form on desktop, top-right corner of the art banner on phones;
  - it never covers the heading or the form.
- **No change to how sign-in works:**
  - validation, error messages, "keep me logged in" and safe redirects;
  - sign-up with terms, the "check your email" screen, the password reset email, and setting a new password.

## Tests

| Suite | Result |
|---|---|
| New `run-p6`: landing and sign-in pages | 78/78 |
| All earlier suites (Phases 1–5, auth, trackers, coach tools, leaderboard, journal & reports, PWA) | 516/516 |
| **Browser total** | **594/594**, with the CSP active and no console errors |
| SQL security and scoring | 52/52 |

`run-p6` covers:
- the landing content and links, and the theme toggle on landing and login;
- bad email, wrong password and a successful login;
- the register validation and sign-up, the forgot-password email, and the reset page;
- all 5 pages at 320 / 360 / 390 / 430 / 768 / 1280 px in both themes: no sideways scroll, nothing off-screen, no clipped text, the toggle never overlapping text;
- contrast in both themes (every measured pair ≥ 4.5:1).

**Unverified:** the live site on a real phone; a real sign-up email through Brevo.

## Files
- **Changed:**
  - `index.html`, `js/landing.js`, `js/auth-pages.js`
  - `css/style.css` (auth section), `css/responsive.css`
  - `sw.js` (`ryl-v9`, now caches `landing.css`)
- **Added:** `css/landing.css`, `docs/REDESIGN-2.0-PHASE-6.md`

## Redesign 2.0: complete

| Phase | Pages |
|---|---|
| 1 | Design system, Light/Dark, Home dashboard, bottom navigation |
| 2 | Track list, 4 tracker pages |
| 3 | Leaderboard, Journal |
| 4 | My progress, Profile |
| 5 | Coach console (7 pages) |
| 6 | Landing, Login, Register, Forgot, Reset |

- **Backend changes:** one read-only function, `get_my_streaks()` (Phase 1).
- **Unchanged:** tables, RLS, grants, scoring, bonuses, badges and auth.
- **Not redesigned on purpose:** `offline.html` and `404.html` are self-contained (they follow the saved theme), the email templates, and `design/` (the v1 mock-up, kept for reference).
