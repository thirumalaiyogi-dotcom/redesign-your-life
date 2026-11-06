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
| See who ticked what | **Check-ins** (pick a date, filter by tracker or status, search by name) |
| Remove a fake tick | **Check-ins** → **Remove**, with a reason. The member sees the reason and the points are taken back. |
| Give extra points | **Members** → **Bonus** (1–500 points, with a reason) |
| Change a picture, description or points | **Activities** → **Edit**. Activity names cannot be changed. |
| Change bonus values | Super Admin → **Settings** |
| Read members' journals | **Reports** → **Shared journals** (only entries the member chose to share) |
| Download a report | **Reports** → pick a period → **Download CSV** (opens in Excel or Google Sheets) |

## Coach details, testimonials and the next workshop
All of Deepak's details live in one file: **`js/site-content.js`** (on GitHub: open the file → pencil icon → edit → Commit). The site updates in 1–2 minutes.
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
