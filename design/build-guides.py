# Builds guide.html (members) and coach-guide.html (coach) from the step lists below.
# Screenshots: assets/guide/*.webp (taken with the app on a phone-size screen, demo data).
# Run: python3 design/build-guides.py
import html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

HEAD = '''<!doctype html>
<html lang="ta">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#123b2e">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>{title} · Redesign Your Life</title>
<meta name="description" content="{desc}">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="assets/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<script src="js/theme-init.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Plus+Jakarta+Sans:wght@500..800&family=Noto+Sans+Tamil:wght@400..700&display=swap">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/guide.css">
<style>body{{font-family:Inter,'Noto Sans Tamil',system-ui,sans-serif}}</style>
</head>
<body id="top">
<main class="g-wrap">
'''


def keys(items):
    out = []
    for k, t in items:
        cls = ' class="tip"' if k == '★' else ''
        out.append(f'<li><b{cls}>{k}</b><span>{t}</span></li>')
    return '<ol class="g-keys">' + ''.join(out) + '</ol>'


def step(i, sid, title, intro, shots, items, note=None):
    imgs = ''.join(f'<figure class="g-shot"><img src="assets/guide/{s}.webp" alt="{html.escape(title)}" loading="lazy" width="360" height="779"></figure>' for s in shots)
    grid = f'<div class="g-shots{" two" if len(shots) > 1 else ""}">{imgs}</div>' if shots else ''
    n = f'<div class="g-note">{note}</div>' if note else ''
    return f'''<section class="g-step" id="{sid}"><div class="g-step-h"><span class="n">{i}</span><h2>{title}</h2></div>
<p>{intro}</p>{grid}{keys(items) if items else ''}{n}</section>
'''


def page(fname, title, desc, hero_h, hero_p, cta, flow, steps, extra=''):
    toc = '<ul class="g-toc">' + ''.join(f'<li><a href="#{s[0]}"><b>{i}</b>{s[1]}</a></li>' for i, s in enumerate(steps, 1)) + '</ul>'
    body = ''.join(step(i, *s) for i, s in enumerate(steps, 1))
    doc = HEAD.format(title=title, desc=desc) + f'''<header class="g-hero"><div class="g-brand"><img src="assets/icons/logo-96.png" alt="">Deepak's Redesign Your Life</div>
<h1>{hero_h}</h1><p>{hero_p}</p><a class="g-cta" href="{cta[1]}">{cta[0]}</a></header>
{flow}{toc}{body}{extra}
<p class="g-foot">சிவப்பு எண் ① ② ③ = படத்தில் தட்ட வேண்டிய இடம்.<br>படங்கள் மாதிரி கணக்கு (demo) வைத்து எடுத்தவை; உங்க app-ல உங்க பெயர், உங்க points வரும்.<br><a href="privacy.html">Privacy</a></p>
</main>
<a class="g-top" href="#top" aria-label="மேலே போக">↑</a>
</body>
</html>
'''
    (ROOT / fname).write_text(doc, encoding='utf-8')


# ------------------------------------------------------------------ members
M = [
    ('login', 'Login பண்ணுங்க', 'Coach WhatsApp-ல அனுப்பின link-ஐ phone-ல திறங்க. மூணு வழியில எதாவது ஒண்ணு போதும்.', ['m01-login'], [
        ('1', '<b>Continue with Google</b> - coach-கிட்ட கொடுத்த Gmail-ஐ தேர்வு செய்யுங்க. Password வேண்டாம், உடனே உள்ள போயிடலாம். (எளிய வழி)'),
        ('2', 'Gmail இல்லையா? <b>Get a login code by email</b> தட்டுங்க - உங்க email-க்கு 6 இலக்க code வரும்.'),
        ('3', 'அல்லது coach அனுப்பின email, password போட்டு <b>Log in</b>. முதல் தடவை உங்க சொந்த password வைக்க சொல்லும்.')],
     'உங்க email coach list-ல இருந்தா மட்டும் login ஆகும். "not on your coach\'s list" வந்தா coach-கிட்ட சொல்லுங்க.'),
    ('code', 'Email code போடுங்க', 'Email போட்டு <b>Send code to my email</b> தட்டினா ஒரு நிமிஷத்துல code வரும்.', ['m02-code'], [
        ('1', 'Email-ல வந்த 6 இலக்க code-ஐ copy பண்ணி <b>Paste</b> தட்டுங்க. 6 இலக்கமும் வந்ததும் தானா login ஆகும்.')],
     'Code வரலைன்னா Spam / Promotions folder பாருங்க. ஒரு நிமிஷம் கழிச்சு <b>Send again</b> தட்டலாம்.'),
    ('install', 'App மாதிரி phone-ல வைங்க', 'Play Store தேவையில்ல. ஒரு தடவை இப்படி பண்ணினா home screen-ல <b>10X</b> icon வரும், தட்டினா நேரா app திறக்கும்.', [], [
        ('★', '<b>Android (Chrome):</b> மேல வலது பக்க ⋮ மூணு புள்ளி → <b>Add to Home screen</b> அல்லது <b>Install app</b> → Install.'),
        ('★', '<b>iPhone (Safari):</b> கீழ Share பட்டன் (□↑) → <b>Add to Home Screen</b> → Add.')]),
    ('notify', 'Notifications Allow பண்ணுங்க', 'முதல் தடவை app திறக்கும்போது இது கேட்கும்.', ['m03-push'], [
        ('1', '<b>Allow</b> தட்டுங்க. Coach பதில், class update, இரவு நினைவூட்டல் எல்லாம் WhatsApp மாதிரி phone-க்கு வரும். <b>Later</b> தட்டினா நாளைக்கு மறுபடி கேட்கும்.')]),
    ('home', 'Home - ஒரே பார்வையில இன்றைக்கு', 'App திறந்ததும் வர்ற முதல் screen.', ['m04-home'], [
        ('1', 'இன்றைய progress - இன்னைக்கு எத்தனை habits முடிஞ்சது.'),
        ('2', '<b>Today</b> இன்றைய points · <b>Streak</b> தொடர்ந்து எத்தனை நாள் · <b>Rank</b> உங்க இடம்.'),
        ('3', '<b>Continue today\'s habits</b> - நேரா tick பண்ண போகலாம்.'),
        ('4', '<b>To-do</b> - உங்க சொந்த வேலை பட்டியல்.'),
        ('5', 'கீழ menu: Home · Track · Leaderboard · Journal · Profile.')]),
    ('track', 'Track - tracker தேர்வு செய்யுங்க', 'Coach திறந்த tracker-கள் எல்லாம் இங்க இருக்கும்.', ['m05-trackers'], [
        ('1', 'இன்னைக்கு எல்லா tracker-லயும் சேர்த்து எத்தனை முடிஞ்சது, எத்தனை பாக்கி.'),
        ('2', 'ஒரு tracker-ஐ தட்டினா அதோட habits திறக்கும். 🔒 பூட்டு இருந்தா, அந்த class முடிஞ்சதும் coach திறப்பார்.')]),
    ('inside', 'Tracker உள்ளே', 'மேல tracker பெயர்கள் - தட்டி அடுத்த tracker-க்கு மாறலாம்.', ['m06-tracker'], [
        ('1', '<b>Notes · Audio · Ask</b> - coach notes, audio, video; உங்க அனுபவம்; கேள்வி கேட்க.'),
        ('2', '<b>Quick tick</b> - ஒவ்வொரு habit-ஆ வேகமா tick பண்ண (சுமார் 30 விநாடி).')]),
    ('tick', 'Habit tick பண்ணுங்க', 'ஒவ்வொரு habit card-லயும் இரண்டு பட்டன். தட்டினதும் சின்ன சத்தமும் animation-உம் வரும்.', ['m07-tick', 'm08-list'], [
        ('1', '<b>✓ Done</b> - செய்தேன். +10 points.'),
        ('2', '<b>✗ Not done</b> - செய்யல. 0 points, மைனஸ் கிடையாது. உண்மையா போடுங்க.'),
        ('3', 'Card view / List view மாற்ற. List-ல எல்லாம் ஒரே பட்டியலா வரும், வேகமா முடிக்கலாம்.')],
     'இன்றைய habits-ஐ மட்டும் tick பண்ணலாம் - நேத்து விட்டதை இன்னைக்கு போட முடியாது. தவறா தட்டிட்டா மறுபடி தட்டி மாற்றலாம்.'),
    ('quick', 'Quick tick - ஒண்ணொண்ணா', 'ஒரு நேரத்துல ஒரு habit மட்டும் பெருசா வரும். யோசிக்காம வேகமா முடிக்க இது தான் எளிது.', ['m09-quick'], [
        ('1', '<b>Done</b> தட்டுங்க, அல்லது படத்தை வலது பக்கம் swipe பண்ணுங்க →'),
        ('2', '<b>Not done</b> தட்டுங்க, அல்லது இடது பக்கம் swipe ←'),
        ('★', '<b>Skip</b> - அப்புறம் பண்ண. கடைசியில மொத்த summary வரும்.')]),
    ('notes', 'Notes · Audio · Ask', 'ஒவ்வொரு tracker-க்கும் ஒரே இடம்.', ['m10-sheet'], [
        ('1', '<b>Learn</b> - coach போட்ட notes, படங்கள், audio, video.'),
        ('2', '<b>Real life</b> - இந்த habit-ஐ வாழ்க்கையில எப்படி செஞ்சீங்கன்னு எழுதுங்க / படம் போடுங்க.'),
        ('3', '<b>Ask</b> - coach-கிட்ட கேள்வி. பதில் வந்ததும் notification வரும்.')]),
    ('todo', 'To-do பட்டியல்', 'Home-ல <b>To-do</b> பட்டன் தட்டுங்க. உங்களுக்கு மட்டும் தான் தெரியும்.', ['m11-todo'], [
        ('1', 'வேலையை எழுதி ↑ தட்டுங்க. Today / Tomorrow / Date / Repeat (தினமும், வாரம்) / ⭐ முக்கியம் தேர்வு செய்யலாம்.'),
        ('2', '<b>Today · Week · Month</b> - நாள், வாரம், மாதம் வாரியா பார்க்க. முடிச்சதும் வட்டத்தை தட்டுங்க.')]),
    ('board', 'Leaderboard', 'எல்லாரும் tick பண்ண பண்ண உடனே மாறும்.', ['m12-board'], [
        ('1', '<b>My batch</b> - உங்க batch மட்டும் · <b>Everyone</b> - எல்லாரும்.'),
        ('2', '<b>Since start</b> · <b>This week</b> · <b>Today</b>.'),
        ('★', 'ஒரே points-ஆ இருந்தா - யார் தினமும் தவறாம பண்றாங்களோ (consistency) அவங்க முன்னாடி.')]),
    ('journal', 'Journal - இரவு 2 நிமிஷம்', 'ஒவ்வொரு இரவும் 5 சின்ன கேள்வி. நீங்க share பண்ணினா மட்டும் coach பார்ப்பார்.', ['m13-journal'], []),
    ('ask', 'Sessions & கேள்விகள்', 'Profile → Sessions அல்லது Home → Sessions.', ['m14-learn'], [
        ('1', '<b>Questions</b> - நீங்க கேட்ட கேள்வியும் coach பதிலும்.'),
        ('2', 'ஒவ்வொரு class-ஓட notes, படம், audio, video.')]),
    ('badges', 'Progress & Badges', 'Profile → My progress. ஒவ்வொரு tracker-லயும் எவ்வளவு பண்ணீங்க, என்ன badges கிடைச்சது.', ['m15-badges'], [
        ('★', '7 நாள் தொடர்ந்து → 7-Day Streak · 30 → 30-Day Consistency · 60 → 60-Day Transformation · 90 → 90-Day Champion.'),
        ('★', 'ஒரு நாள் streak-ல சேர, அன்னைக்கு குறைஞ்சது ஒரு habit Done ஆகணும்.')]),
    ('profile', 'Profile', 'உங்க படம், விவரம், settings.', ['m16-profile', 'm17-settings'], [
        ('1', 'படத்தை தட்டி photo போடுங்க. விரலால நகர்த்தி, pinch பண்ணி முகம் பெருசா வைக்கலாம்.'),
        ('2', '<b>Tick sound</b> - சத்தம் வேண்டாம்னா எடுத்துடலாம்.'),
        ('3', 'Coach-க்கு நேரா WhatsApp.')],
     'Notifications வரலைன்னா இங்க <b>Phone notifications → Turn on</b> தட்டுங்க.'),
]

M_FLOW = '''<div class="g-flow"><h2>தினமும் 3 வேலை மட்டும்</h2><ol>
<li>App திறங்க → <b>Continue today's habits</b>.</li>
<li>ஒவ்வொரு habit-க்கும் <b>✓ Done</b> அல்லது <b>✗ Not done</b> (அல்லது Quick tick).</li>
<li>இரவு 2 நிமிஷம் <b>Journal</b>.</li></ol></div>'''

page('guide.html', 'App guide', 'Redesign Your Life app-ஐ எப்படி பயன்படுத்துவது - படிப்படியா.',
     'App-ஐ எப்படி பயன்படுத்துவது', 'Login முதல் badges வரை, படத்தோட படிப்படியா. சிவப்பு எண் இருக்கிற இடத்தை தட்டுங்க.',
     ('App-ஐ திறங்க →', 'login.html'), M_FLOW, M)

# ------------------------------------------------------------------ coach
C = [
    ('console', 'Coach Console', 'Coach login பண்ணினா நேரா இங்க வரும் (member மாதிரியே Google / code / password login).', ['c01-console'], [
        ('1', 'மேல menu - இடது வலது swipe பண்ணா எல்லா பக்கமும்: Overview · Check-ins · Members · Batches · Sessions · Activities · Leaderboard · Reports · Settings.'),
        ('2', '📱 <b>Member view</b> - members-க்கு app எப்படி தெரியுதுன்னு நீங்களே பார்க்க.'),
        ('★', 'Sessions மேல சிவப்பு எண் = பதில் சொல்ல வேண்டிய கேள்விகள்.')]),
    ('batch', 'புது Batch உருவாக்குங்க', '<b>Batches</b> பக்கம் → New batch. ஒவ்வொரு program தொடக்கத்துக்கும் ஒரு batch.', ['c02-newbatch'], [
        ('1', 'Program தேர்வு (7-Day Online / 60-Day Membership / Workshop), batch பெயர் (உதா: 7-Day · 16 Nov), தொடங்கும் நாள் → <b>Create batch</b>.')]),
    ('people', 'ஆட்களை சேருங்க', 'பெயர், email, phone - எந்த வரிசையிலும், comma அல்லது tab போட்டு. ஒரு வரிக்கு ஒருத்தர்.', ['c03-addpeople'], [
        ('1', 'List-ஐ இங்க paste பண்ணுங்க (Google Form / WhatsApp-ல இருந்து copy பண்ணலாம்).'),
        ('2', 'அல்லது <b>Excel / CSV upload</b> - பெயர், email, phone column-களை தானா எடுத்துக்கும்.'),
        ('3', '<b>Add to batch</b> - ஒவ்வொருத்தருக்கும் account தானா உருவாகும், ஒரு password-உம் வரும்.')],
     'ஏற்கனவே account இருக்கிறவங்க "Already had an account"-ஆ இந்த batch-ல சேர்க்கப்படுவாங்க - புது account வராது.'),
    ('send', 'Login விவரம் அனுப்புங்க', 'சேர்த்ததும் இந்த பட்டியல் வரும். Password இப்போ மட்டும் தான் தெரியும் - பக்கத்தை மூடும் முன் அனுப்பிடுங்க.', ['c04-whatsapp'], [
        ('1', '<b>WhatsApp</b> - அந்த நபருக்கு link, email, password எல்லாம் ready message-ஆ திறக்கும். Send மட்டும் தட்டுங்க.'),
        ('2', '<b>Group message</b> - WhatsApp group-க்கு ஒரே message. Gmail இருக்கிறவங்க "Continue with Google" தட்டினாலே போதும்.')]),
    ('dayn', 'ஒவ்வொரு class முடிஞ்சதும்', 'Batch-ஐ திறந்தா Day 1, Day 2... பட்டியல் இருக்கும்.', ['c05-batch'], [
        ('1', 'Class முடிஞ்சதும் <b>Day 1 done ✓</b> தட்டுங்க. அந்த நாளுக்கான tracker அந்த batch-ல எல்லாருக்கும் திறக்கும், notification-உம் போகும்.'),
        ('★', '<b>Leaderboard</b> - இந்த batch-ஓட ranking. <b>Mark finished</b> - program முடிஞ்சதும்.')]),
    ('programs', 'எந்த நாள் எந்த tracker? (ஒரு தடவை)', 'Batches → <b>Programs</b> tab. Program-ஐ தேர்வு செய்து ஒவ்வொரு நாளுக்கும் tracker-ஐ tick பண்ணுங்க. ஒரு தடவை செட் பண்ணா எல்லா batch-க்கும் அதே.', ['c07-programs'], [
        ('1', '<b>Programs</b> tab.'),
        ('2', 'Day-க்கு கீழ tracker பெயரை தட்டினா அது ✓ குறியோட தேர்வாகும். மறுபடி தட்டினா எடுத்துடும்.')]),
    ('list', 'Batch-ல இருக்கிறவங்க', 'Batch பக்கத்துல கீழ இறங்கினா People.', ['c06-people'], [
        ('★', '<b>First login pending</b> - இன்னும் login பண்ணல. அவங்களுக்கு மறுபடி WhatsApp பண்ணுங்க.'),
        ('★', '<b>New password</b> - password மறந்தவங்களுக்கு புது password.'),
        ('★', 'Checkbox-ல ஆட்களை தேர்வு செய்து <b>வேறு batch-க்கு</b> சேர்க்கலாம் (உதா: 7-Day முடிச்சவங்கள்ல fees கட்டினவங்களை 60-Day Membership-க்கு).')]),
    ('trackers', 'புது Tracker / Habit', 'Batches → <b>Trackers</b> tab. புது tracker sheet உருவாக்கி அதுக்கு habits சேர்க்கலாம். உருவாக்கியதும் Programs-ல எந்த நாள் திறக்கணும்னு tick பண்ணுங்க.', ['c08-trackers'], []),
    ('checkins', 'Check-ins - யார் tick பண்ணாங்க', 'நாள் வாரியா ஒவ்வொருத்தரும் எத்தனை Done, Not done. ஒருத்தர் பெயரை தட்டினா அவங்க habit வாரியா பார்க்கலாம்.', ['c09-checkins'], [
        ('★', 'செய்யாம tick பண்ணது தெரிஞ்சா அந்த tick-ஐ <b>Remove</b> பண்ணலாம் - காரணம் கேட்கும், அவங்களுக்கு notification போகும், points போயிடும்.')]),
    ('questions', 'கேள்விகளுக்கு பதில்', '<b>Sessions → Questions</b>. பதில் போட்டு <b>Send answer</b> - member-க்கு உடனே notification போகும்.', ['c11-questions', 'c12-sessions'], [
        ('1', 'பதில் காத்திருக்கும் கேள்விகள் எண்ணிக்கை.'),
        ('★', '<b>Sessions</b> tab-ல ஒவ்வொரு class-ஓட notes, படம், audio, video link போடலாம். <b>Real life</b> tab-ல members அனுபவங்கள்.')]),
    ('members', 'Members', 'எல்லா members பட்டியல். ஒருத்தருக்கோ எல்லாருக்குமோ notification அனுப்பலாம். Tracker access-ஐ தனியா கொடுக்கலாம் / எடுக்கலாம்.', ['c10-members'], []),
    ('reports', 'Leaderboard & Reports', 'Leaderboard-ல batch தேர்வு செய்யலாம். Reports-ல தேதி வாரியா points, consistency - <b>Download CSV</b> (Excel-ல திறக்கும்).', ['c13-board', 'c14-reports'], []),
    ('settings', 'Settings - points மதிப்பு', 'Bonus points-ஐ இங்க மாற்றலாம். மாற்றினா இனிமே வர்ற tick-களுக்கு மட்டும்.', ['c15-settings'], []),
]

POINTS = '''<section class="g-step" id="points"><div class="g-step-h"><span class="n">₹</span><h2>Points எப்படி கணக்கு போடுறோம்</h2></div>
<p>எல்லா கணக்கும் server-ல (database) நடக்கும் - phone-ல யாரும் மாற்ற முடியாது. Points ஒருபோதும் மைனஸ் ஆகாது.</p>
<table class="g-table"><thead><tr><th>எப்போ</th><th>Points</th></tr></thead><tbody>
<tr><td>ஒரு habit <b>✓ Done</b> (Activities-ல habit வாரியா மாற்றலாம்)</td><td class="pts">+10</td></tr>
<tr><td>ஒரு habit <b>✗ Not done</b></td><td class="pts">0</td></tr>
<tr><td><b>Daily bonus</b> - அன்னைக்கு அவருக்கு திறந்த எல்லா habits-உம் Done</td><td class="pts">+20</td></tr>
<tr><td><b>Streak bonus</b> - தொடர்ச்சியின் ஒவ்வொரு 7வது நாளும் (7, 14, 21...)</td><td class="pts">+30</td></tr>
<tr><td><b>Perfect week</b> - திங்கள் முதல் ஞாயிறு வரை எல்லா habits, எல்லா நாளும் (ஞாயிறு அன்று)</td><td class="pts">+50</td></tr>
<tr><td><b>Coach bonus</b> - Members-ல ஒருத்தருக்கு, காரணத்தோட (1 முதல் 500)</td><td class="pts">+1…500</td></tr>
<tr><td>Coach ஒரு tick-ஐ <b>Remove</b> பண்ணா</td><td class="pts">அந்த points போகும்</td></tr>
</tbody></table>
<ol class="g-keys">
<li><b class="tip">★</b><span><b>Streak</b>: அன்னைக்கு குறைஞ்சது 1 habit Done பண்ணா அந்த நாள் streak-ல சேரும் (Settings-ல "Ticks needed for a streak day" மாற்றலாம்). ஒரு நாள் விட்டா மறுபடி 1-ல இருந்து.</span></li>
<li><b class="tip">★</b><span><b>இன்றைய நாள் மட்டும்</b>: members இன்றைய habits-ஐ மட்டும் tick பண்ண முடியும். நாள் இந்திய நேரம் இரவு 12 மணிக்கு மாறும்.</span></li>
<li><b class="tip">★</b><span><b>Leaderboard</b>: மொத்த points. ஒரே points-ஆ இருந்தா - consistency அதிகம் → நீண்ட streak → முதல்ல அந்த score-ஐ தொட்டவர்.</span></li>
<li><b class="tip">★</b><span><b>Consistency %</b>: அந்த காலத்துல எத்தனை நாள் tick பண்ணாங்க ÷ மொத்த நாள்.</span></li>
</ol></section>
<section class="g-step" id="badges"><div class="g-step-h"><span class="n">🏅</span><h2>Badges எப்போ கிடைக்கும்</h2></div>
<table class="g-table"><thead><tr><th>Badge</th><th>எப்போ</th></tr></thead><tbody>
<tr><td>First Activity</td><td>முதல் habit tick</td></tr>
<tr><td>7-Day Streak · 30-Day Consistency · 60-Day Transformation · 90-Day Champion</td><td>7 / 30 / 60 / 90 நாள் தொடர்ந்து (ஒரு நாளைக்கு குறைஞ்சது 1 habit)</td></tr>
<tr><td>Wealth Master · Karma Star · Champion Mindset</td><td>அந்த tracker-ஓட எல்லா habits-உம் 7 வெவ்வேறு நாள் முழுசா</td></tr>
<tr><td>Perfect Week</td><td>ஒரு வாரம் எல்லா habits எல்லா நாளும்</td></tr>
<tr><td>Monthly Champion</td><td>மாதம் முடிஞ்சதும் Settings → "Award last month's champion" தட்டினா #1-க்கு</td></tr>
</tbody></table>
<div class="g-note"><b>புது tracker சேர்த்தா என்ன மாறும்?</b><br>
• Streak badges (7/30/60/90) - <b>மாறாது</b>. ஒரு நாளைக்கு 1 habit போதும், tracker எத்தனை இருந்தாலும் அதே.<br>
• Daily bonus (+20), Perfect Week - <b>கொஞ்சம் கடினமாகும்</b>, ஏன்னா "எல்லா habits" = அந்த நபருக்கு திறந்த எல்லா habits. Batch-ல நாள் நாளா tracker திறக்கும்போது அது தானா கணக்கில வரும்.<br>
• Master badges இப்போ Wealth, Karma, Champion-க்கு மட்டும். புது tracker-க்கு வேணும்னா சேர்க்கலாம்.<br>
• ஏற்கனவே கிடைச்ச badges, points ஒருபோதும் போகாது.</div></section>
'''

C_FLOW = '''<div class="g-flow"><h2>முழு flow - 5 படி</h2><ol>
<li><b>Programs</b>-ல எந்த நாள் எந்த tracker திறக்கணும்னு ஒரு தடவை tick.</li>
<li><b>Batches → New batch</b>.</li>
<li>ஆட்கள் list paste / Excel → <b>Add to batch</b>.</li>
<li><b>WhatsApp</b> / Group message-ல login அனுப்பு.</li>
<li>ஒவ்வொரு class முடிஞ்சதும் <b>Day N done ✓</b>. Points, streak, leaderboard, badges எல்லாம் தானா நடக்கும்.</li></ol></div>'''

page('coach-guide.html', 'Coach guide', 'Coach-க்கு: batch, ஆட்கள் சேர்ப்பது, class, points கணக்கு - படிப்படியா.',
     'Coach guide', 'Batch உருவாக்குவது முதல் points கணக்கு வரை, படத்தோட.',
     ('Coach Console திறங்க →', 'admin/dashboard.html'), C_FLOW, C, POINTS)
print('ok')
