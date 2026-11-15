# Running Deepak's Redesign Your Life

**App:** https://thirumalaiyogi-dotcom.github.io/redesign-your-life/
**Database:** Supabase project `redesign-your-life` (`gcbizlnpryihrrmjwbdv`, Mumbai), Free plan
**Code:** github.com/thirumalaiyogi-dotcom/redesign-your-life. GitHub Pages republishes 1–2 minutes after every push to `main`.

## Everyday

| Task | Where |
|---|---|
| Add members | Coach console → **Members** → **Copy link** → send it. Each person signs up and joins as a Member. |
| Make someone a coach | Super Admin → **Members** → role dropdown → **Coach** |
| Stop someone's access | **Members** → **Pause**. Points and history are kept; **Activate** brings them back. |
| See each member's progress | **Check-ins → By member**: one card per member for the day (done / not done / not marked). Tap a card for that member's page: all 58 habits by tracker, notes, the last 14 days, and Remove. Also **Members → Progress**. |
| See who ticked what | **Check-ins → All entries** (pick a date, filter by tracker or status, search by name) |
| Remove a fake tick | **Check-ins** → **Remove**, with a reason. The member sees the reason and the points are taken back. |
| Give extra points | **Members** → **Bonus** (1–500 points, with a reason) |
| Change a picture, description or points | **Activities** → **Edit**. Activity names cannot be changed. |
| Change bonus values | Super Admin → **Settings** |
| Read members' journals | **Reports** → **Shared journals** (only entries the member chose to share) |
| Download a report | **Reports** → pick a period → **Download CSV** (opens in Excel or Google Sheets) |

## Coach details, testimonials and the next workshop
All of Deepak's details live in one file: **`js/site-content.js`** (on GitHub: open the file → pencil icon → edit → Commit). The site updates in 1–2 minutes.

**Landing page on/off:** at the top of that file, `LANDING_PAGE = false` means the site opens straight on the login screen (no program/coach page). Change it to `true` to bring the full landing page back.
- **Next workshop:** change `title`, `start` (yyyy-mm-dd), `days`, `time`, `where`. It shows on the landing page and on members' Home from today until the last day, then hides by itself. Set `WORKSHOP = null` to hide it.
- **Payment link:** paste the Razorpay page link into `registerUrl`; a "Register & pay" button appears next to WhatsApp.
- **Testimonials:** add or remove lines in `TESTIMONIALS` (name, photo in `assets/coach/`, quote). Show only people who agreed to be shown.
- **Success-story count, phone, email:** `COACH.successStories`, `CONTACT`.
- **Photos:** `assets/coach/` (Deepak's portrait and face, awards, community, testimonial faces). To swap a photo, upload a new file with the same name.

## Every month (1st or 2nd)
**Settings** → **Award last month's champion**. This gives the Monthly Champion badge to last month's #1. Pressing it twice does no harm.

## Things to know about the free plans
- **Supabase pauses a Free project after 7 days with no activity.** With members ticking daily this won't happen. If it does, open the Supabase dashboard and press **Restore**.
- **Backups:** the Free plan has no downloadable daily backups. Download a **Reports → CSV** every month. Before a big batch joins, consider Supabase **Pro** (about $25/month), which adds daily backups, leaked-password protection and no pausing.
- **Emails** (confirm sign-up, reset password) go through **Brevo**: free, 300 per day. While the sender is a Gmail address they often land in **Spam**, so tell members to check Spam and tap **Report not spam**.
- **GitHub Pages needs the repo to stay public on a free GitHub account.** That's safe: the code holds no secrets (only the public anon key), and all data is protected by the database rules (see SECURITY.md).

## When a domain is bought (about 30 minutes)
1. **GitHub** → repo **Settings → Pages → Custom domain** → enter the domain. At the registrar, add the DNS records GitHub shows. Tick **Enforce HTTPS**.
2. **Supabase** → Authentication → **URL Configuration**: set Site URL to the new domain and add `https://<domain>/**` under Redirect URLs. Keep the github.io entry for a few weeks.
3. **Brevo** → Senders, Domains → **add the domain**, add its DKIM/DMARC records at the registrar, then create a sender such as `noreply@<domain>`.
4. **Supabase** → Authentication → Emails → **SMTP Settings** → change the sender email to `noreply@<domain>`.
5. In the code, nothing needs to change: all links are relative. To use Vercel instead of GitHub Pages, import the repo in Vercel; `vercel.json` already adds the security headers.

## Settings to change once in the Supabase dashboard
- Authentication → Sign In / Providers → Email → **Minimum password length: 8**
- Authentication → **Rate Limits** → emails per hour: **100** (allowed now that custom SMTP is on)

## If something breaks
- **The app shows "Can't reach the server":** check that the Supabase project is not paused.
- **Sign-up emails stop:** check Brevo's daily limit (300) and that the SMTP key hasn't expired. The current key expires in Nov 2027; create a new one in Brevo → SMTP & API and paste it into Supabase → SMTP Settings → Password.
- **A member can't log in:** Coach console → Members. Are they paused? Is "Email not confirmed" shown? They can use **Forgot password** on the login page.


## New in Redesign 2.1 (Nov 2026)
- **Extra trackers (Conscious Couple, Mugilan's Habits):** Coach console → Members → **Trackers** on a member → tick the tracker → Save. Only those members see it. Each habit is +10 like the others. Pictures for these habits can be added in **Activities**.
- **Sessions:** Coach console → **Sessions** → **New session**. Add title, notes, then pictures, audio (up to 15 MB) and YouTube / Drive links. Turn "Show to members" off to keep it as a draft. Members get a notification when it is shown.
- **Questions:** members ask from their Sessions page. Waiting questions show on the Overview and under Sessions → Questions. Your answer reaches only that member.
- **Real life vs application:** members' notes are under Sessions → Real life, and on each member's Progress page.
- **Member details & goals:** each member fills City, Profession, Dream, Hobbies, Website and private Goals (incl. net worth, turnover, profit) in Profile. Coaches see them on the member's Progress page; other members never do.
- **To-do:** a personal list for each member. Coaches do not see it.
- **Phone notifications:** members turn them on in Profile. Reminders at 8 pm (if nothing ticked) and 7 am (to-dos due). On iPhone the app must be added to the Home Screen first. Setup steps are in `supabase/README.md`.

## New in Redesign 2.2 (Nov 2026)
- **Coach opens every tracker.** A new member sees no tracker until you open one. Coach console → Members → **Tracker access** → "Open for all" after the session that teaches it, or **Trackers** on one person. Everyone who joined before 14 Nov already has the 4 main trackers.
- **Explain each point:** Activities → pick a tracker → **Explain** on a habit → add an audio (on a phone you can record a voice note), pictures or a YouTube link. Members tap “Learn · Real life · Ask” on that habit's card.
- **Per-point real life and questions:** members write a real situation for a habit, can attach their own picture, and ask a question about that habit. You see them under Sessions → Questions / Real life (with the habit name) and on the member's Progress page.
- **To-do priority boxes:** Urgent & important / Important, not urgent / Urgent, not important / Not urgent, not important.
- **Morning note at 7:30 am** to members who did not mark anything yesterday (besides the 8 pm reminder).

## New in Redesign 2.3 (Nov 2026)
- **Members see all 4 program trackers, locked** ("Opens after the class") with their habit names, until you open them. Personal trackers (Conscious Couple, Mugilan's) stay hidden unless given.
- **Class materials per tracker:** Activities → pick the tracker → **Add materials** at the top → slides (save PowerPoint as PDF, up to 25 MB), audio, pictures, links. Members see them at the top of the tracker once it is open.
- **Send a notification:** Coach console → Members → **To all members** (top), or **Notify** on one person. It shows in the app's bell and on the phone of members who turned phone notifications on.

## New in Redesign 2.4 (Nov 2026): programs, batches, coach-made logins
- **Coach menu → Batches.** Three tabs:
  - **Batches**: create a batch (program, name, start date). Open it, paste the people list (one per line: name, email, phone) and tap *Add to batch*. Each new person gets a login with a temporary password like `Ryl-7K4MQ2`; tap **WhatsApp** next to each name to send it. Passwords are shown only once — if one is lost, tap *New password* in the people list.
  - After each class tap **Day N done ✓**. The trackers linked to that class open for everyone in the batch and they get a notification. People added later get those trackers automatically.
  - **Programs**: the classes of each program (7-Day Online, 60-Day Membership, Physical Workshop) and which trackers each class opens. Add programs for new workshops.
  - **Trackers**: create a new tracker sheet and add its habits (numbered automatically; a habit name cannot be changed after saving, like the original 58). Explanations/audio for each habit are still added on the Activities page.
- **First login**: people on a temporary password are asked to choose their own password before anything else. The people list shows *First login pending* until they do.
- **Sign-up is closed**: the Join page now says the coach sends the login. The super admin can open it again from the Batches tab (*Self sign-up*).
- **Leaderboard**: members see *My batch* (points since the batch started; this week; today) and *Everyone* (the old leaderboard). Coaches pick a batch from the *Show* list on the Leaderboard page.
- The 60-Day Membership program has no classes yet — add them under Programs once the class-to-tracker order is decided.
- **Google login**: the login page has *Continue with Google*. Only emails the coach uploaded can get in; any other Gmail sees "This Gmail is not on your coach's list". People who come in with Google skip the temporary-password step. Until the Google provider is turned on in Supabase, the button says "coming soon".
- **Excel / CSV upload** on a batch page: the name, email and phone columns are found automatically (a Google Form export with Timestamp/City columns works). The list fills the box first so you can check it before tapping *Add to batch*. Reader: SheetJS 0.18.5 (js/vendor/xlsx.mini.min.js), loaded only on this page; only open files you trust.
- **Moving people on (e.g. 7-Day → 60-Day Membership)**: create the membership batch first. Then open the 7-Day batch, tick the people who joined (or the top box for everyone) and tap *Add to batch* with the membership batch chosen. They keep the same login and points and appear in both batches.
- **One "Notes · Audio · Ask" per tracker** (Deepak's request): the per-habit "Learn · Real life · Ask" buttons are gone. Each tracker page has one button at the top. *Learn* shows everything the coach added (the tracker's class materials, plus each habit's audio/pictures grouped under the habit). *Real life* and *Ask* save notes/questions for the tracker, optionally about one habit. Coaches still add materials from the Activities page (class materials bar, or Explain on a habit) and answer questions on the Sessions page, where the tracker name now shows.
- **To-do redesign**: Today · Week · Month tabs, one-line add (Today / Tomorrow / This week / Date chips, ⭐ important, 🔥 urgent appear while typing), Overdue with "Move all to today", a ⋯ menu per task, a week strip, a month calendar and a small stats card (tasks done, % of planned, best day, streak). The old 4-box matrix is the grid button at the top right. To-dos never give points.
- **Repeating to-dos**: Every day / Mon–Fri / Every week / Every month (Repeat chip while adding, or the ⋯ menu). Ticking one makes the next copy automatically (database trigger `todos_repeat`, migration `ryl_23_todo_repeat`); unticking removes it.
- **Question notifications (like chat)**: when a member asks a question, every coach gets "New question from <name>" (in-app + phone push; tapping it opens Sessions → Questions). The coach menu shows a red count on *Sessions* for unanswered questions, and the Overview has a *Turn on* card for the coach's phone notifications. When the coach answers, the member gets "Your coach answered your question" (this already existed). Migration `ryl_24_question_notifies_coach`; send-push redeployed (v2).
- **Phone notifications need "Allow" once per phone.** The app now shows a clear *Turn on notifications* sheet on Home (members) and Overview (coaches) until it is allowed ("Later" waits a day). When a phone already allowed, the app re-registers it for whoever is logged in, every time they open Home/Overview.
- **Login with an email code** (any email: Gmail, Yahoo, Zoho, office mail): login page → *Get a login code by email*. Only emails the coach added get a code. Needs a working email sender: Supabase → Authentication → Emails → SMTP Settings (Gmail: smtp.gmail.com, port 465, the Gmail address, a Google *App password*), and the *Magic Link* template must contain `{{ .Token }}` (see supabase/email-templates/login-code.html). Signing in with a code skips the temporary-password step (`skip_temp_password()`, migration `ryl_25_email_code_login`).
- **Member view for coaches**: the phone icon at the top of the Coach console opens the member app as members see it (a gold "Member view" bar with a *Coach console* link back). In Member view a coach sees every tracker open and can tick to try things; coaches never appear on leaderboards or in member counts (migration `ryl_26_coach_member_view`).
- **Floating To-do button** on member Home (bottom-right, above the menu, like WhatsApp's chat button) with a red count of today's open/overdue tasks. Tapping it opens To-do with the add box ready.
- **Tick rewards**: ticking ✓ plays a soft two-note chime, a short buzz (Android), a card pop and a floating "+10" with a small burst; finishing a whole tracker plays a longer chime. Members can turn the sound/buzz off in Profile → *Tick sound*. Sounds are generated in the browser (js/fx.js, no audio files). Respects "reduce motion".
- **Quick tick** on every tracker: a big "Quick tick · N left" button opens one habit at a time, full screen (big picture, Done / Not done, or swipe right / left), moves to the next by itself, and ends with a summary (+points). **Cards / List** switch next to the legend: List shows compact rows with the still-to-do habits first; the choice is remembered on the phone.
