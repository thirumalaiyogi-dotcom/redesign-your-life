// =====================================================================
// Coach & program content — the ONE place to edit Deepak's details.
// Used by the landing page, the sign-in screens, Home and Profile.
// After editing, push to GitHub; the site updates in 1–2 minutes.
// =====================================================================

export const COACH = {
  name: 'Deepak Rajkumar',
  title: 'Certified EFT Tapping Specialist',
  org: 'SKSCA Billionaire Research Foundation',
  photo: 'assets/coach/deepak-portrait.webp',
  face: 'assets/coach/deepak-face.webp',
  tagline_ta: 'சிந்தனையை மாற்று, வாழ்க்கையை மாற்று.',
  tagline_en: 'Transform your thinking. Transform your life.',
  intro: 'Deepak helps people stop overthinking, laziness, procrastination and stress, scientifically, with simple tools you can use every day.',
  successStories: '8872+',
  pillars: [
    ['crown', 'Millionaire Mindset', 'Think and act like the person you want to become.'],
    ['sparkles', 'Law of Attraction', 'Money psychology and focused intention, made practical.'],
    ['hand', 'Wealth EFT Tapping', 'Release stress and blocks with guided tapping.']
  ],
  awards: [
    ['assets/coach/award-1.webp', 'Recognised at Rise of 4IR, Revolution in Business'],
    ['assets/coach/award-2.webp', 'Honoured on stage for his work'],
    ['assets/coach/award-3.webp', 'Award presentation']
  ],
  community: 'assets/coach/community.webp'
};

export const CONTACT = {
  email: 'dee_deepak2000@yahoo.co.uk',
  phone: '9566664565',
  whatsapp: '919566664565'          // country code + number, no "+"
};

// What members said (shared by Deepak; shown on the landing page).
export const TESTIMONIALS = [
  ['Bala', 'assets/coach/t-bala.webp', 'Scientific approach is amazing… I broke all my limitations in just 7 days!'],
  ['Ponraj', 'assets/coach/t-ponraj.webp', 'You helped me to identify what has been stopping me all these years.'],
  ['Dr Ananth', 'assets/coach/t-ananth.webp', 'No more stress! True financial freedom has finally become my reality now.'],
  ['Anu Nair', 'assets/coach/t-anu.webp', 'I have been to so many expensive workshops before, but this is an unbelievable, life-changing experience for me.'],
  ['Sangeetha', 'assets/coach/t-sangeetha.webp', 'Finally I have found scientific answers to my overthinking, laziness and procrastination.'],
  ['Raghupathi', 'assets/coach/t-raghupathi.webp', 'Scaling up my business has become so easy now with easy-to-apply Millionaire Mindset tools and techniques.']
];

// Next workshop. Shown from today until the last day, then hidden automatically.
// Set to null to hide it. registerUrl: paste the Razorpay page link here when you have it.
export const WORKSHOP = {
  title: 'The Science & Psychology of 10X',
  title_ta: 'ஏன் கடினமாக உழைத்தும் எதிர்பார்த்த வளர்ச்சி கிடைப்பதில்லை?',
  days: 7,
  start: '2026-11-18',              // yyyy-mm-dd (first day)
  time: '5:45 AM – 7:30 AM',
  where: 'Zoom (online)',
  whatsappText: '10X',
  registerUrl: ''                   // e.g. 'https://pages.razorpay.com/pl_XXXX/view'
};

// ---- helpers ----
export const waLink = (text = '') => `https://wa.me/${CONTACT.whatsapp}${text ? '?text=' + encodeURIComponent(text) : ''}`;

// 'upcoming' | 'live' | null (finished or not set). Uses India time.
export function workshopState(today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
  if (!WORKSHOP?.start) return null;
  const end = new Date(WORKSHOP.start + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + (WORKSHOP.days || 1) - 1);
  const last = end.toISOString().slice(0, 10);
  if (today > last) return null;
  return today >= WORKSHOP.start ? 'live' : 'upcoming';
}
export const workshopDate = () => new Date(WORKSHOP.start + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
