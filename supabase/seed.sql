-- =====================================================================
-- Deepak's Redesign Your Life — seed.sql  (run last)
-- Production reference data only: trackers, the 58 activities with the
-- client's original names, badges and point settings.
-- No members or scores are seeded. Safe to run more than once.
-- =====================================================================

insert into public.app_settings(key, value, description) values
  ('timezone',               '"Asia/Kolkata"', 'Day boundary for check-ins'),
  ('daily_completion_bonus', '20', 'Points when every activity is done in a day'),
  ('streak7_bonus',          '30', 'Points on every 7th day of an unbroken streak'),
  ('perfect_week_bonus',     '50', 'Points when every activity is done every day Mon-Sun'),
  ('streak_min_daily',       '1',  'Ticks needed in a day for it to count toward a streak')
on conflict (key) do nothing;

insert into public.tracker_categories(slug, name, tagline, color, icon, sort_order) values
  ('wealth', 'Wealth Habits', 'Small daily habits that build health, focus and abundance.', '#e7b54a', 'sun', 1),
  ('conscious', 'Conscious Habits', 'Stop | Reduce | Take control.', '#e0605a', 'eye', 2),
  ('karma', 'Karma Activities', 'Aware > Apply > Reflect > Transform.', '#f08a3c', 'infinity', 3),
  ('champion', 'Champion Mindsets', 'Train your mind like a champion.', '#5b8cf0', 'trophy', 4)
on conflict (slug) do update set name = excluded.name, tagline = excluded.tagline,
  color = excluded.color, icon = excluded.icon, sort_order = excluded.sort_order;

insert into public.activities(category_id, number, default_name, description, icon, image_path, points)
select c.id, v.number, v.default_name, v.description, v.icon, v.image_path, 10
from (values
  ('wealth', 1, 'E Wakeup', 'Rise early, before the day starts rushing you.', 'sunrise', 'wealth-01.webp'),
  ('wealth', 2, 'E Bowel', 'Clear your system early. A light body starts a light day.', 'leaf', 'wealth-02.webp'),
  ('wealth', 3, 'Hydrate', 'Drink water first thing, then through the day.', 'glass-water', 'wealth-03.webp'),
  ('wealth', 4, 'Forgiveness', 'Release one grudge and free that energy.', 'heart-handshake', 'wealth-04.webp'),
  ('wealth', 5, 'Gratitude', 'Write three things you are thankful for.', 'heart', 'wealth-05.webp'),
  ('wealth', 6, 'Affirmations', 'Speak your affirmations aloud with feeling.', 'mic', 'wealth-06.webp'),
  ('wealth', 7, 'Journaling', 'Write today’s page, honestly.', 'notebook-pen', 'wealth-07.webp'),
  ('wealth', 8, 'Revision', 'Revise what you learned. Learn, revise, grow.', 'book-open', 'wealth-08.webp'),
  ('wealth', 9, 'Move Body EFT', 'Move, stretch and tap through EFT points.', 'activity', 'wealth-09.webp'),
  ('wealth', 10, 'Meditate CBV', 'Sit still and breathe for your set minutes.', 'flower-2', 'wealth-10.webp'),
  ('wealth', 11, 'E Be Happy', 'Choose one moment of joy on purpose.', 'smile', 'wealth-11.webp'),
  ('wealth', 12, 'Live VBS', 'Look at your vision board and feel it real.', 'image', 'wealth-12.webp'),
  ('wealth', 13, 'Ikigai L', 'Take one action toward your purpose.', 'compass', 'wealth-13.webp'),
  ('wealth', 14, 'Unique Skill', 'Practise the skill only you can offer.', 'lightbulb', 'wealth-14.webp'),
  ('wealth', 15, 'Giving', 'Give something: time, help, money or kindness.', 'gift', 'wealth-15.webp'),
  ('wealth', 16, '80/20 To Do List', 'Finish the 20% of tasks that move 80%.', 'list-checks', 'wealth-16.webp'),
  ('conscious', 1, 'Late Night Sleep', 'Slept on time and protected tomorrow’s energy.', 'moon', 'conscious-01.webp'),
  ('conscious', 2, 'Mobile Distractions', 'Used the phone with intention, not on autopilot.', 'smartphone', 'conscious-02.webp'),
  ('conscious', 3, 'News', 'Chose what to take in instead of doom-scrolling.', 'newspaper', 'conscious-03.webp'),
  ('conscious', 4, 'Sugar', 'Kept sugar in check today.', 'candy', 'conscious-04.webp'),
  ('conscious', 5, 'Environment', 'Kept your space clean and supportive.', 'house', 'conscious-05.webp'),
  ('conscious', 6, 'Friends', 'Spent time with people who lift you.', 'users', 'conscious-06.webp'),
  ('conscious', 7, 'False Identity', 'Acted as your true self, not a mask.', 'venetian-mask', 'conscious-07.webp'),
  ('conscious', 8, 'Mental Diarrhea - FAW', 'Caught fear, anxiety and worry loops early.', 'cloud-lightning', 'conscious-08.webp'),
  ('conscious', 9, 'Excuses', 'Did it now instead of later.', 'clock', 'conscious-09.webp'),
  ('conscious', 10, 'Chasing Money', 'Chased value and purpose, and let money follow.', 'coins', 'conscious-10.webp'),
  ('karma', 1, 'Cycle - Desire + Action + Memory - Repeat', 'Notice one desire-action-memory loop you repeated.', 'infinity', 'karma-01.webp'),
  ('karma', 2, 'Action Reaction', 'Pause before reacting. Choose the response.', 'repeat', 'karma-02.webp'),
  ('karma', 3, 'Cause & Effect', 'Trace one result back to its cause.', 'refresh-cw', 'karma-03.webp'),
  ('karma', 4, 'What Is in Your Cup', 'What spilled out when you were shaken today?', 'coffee', 'karma-04.webp'),
  ('karma', 5, 'Thought Pattern', 'Catch a repeating thought and question it.', 'brain', 'karma-05.webp'),
  ('karma', 6, 'Intention', 'Set a clear intention before you act.', 'target', 'karma-06.webp'),
  ('karma', 7, 'Tathastu', 'Speak only what you want to come true.', 'hand', 'karma-07.webp'),
  ('karma', 8, 'Accounts - Karmic Debt', 'Settle one pending account: word, money or apology.', 'scale', 'karma-08.webp'),
  ('karma', 9, 'Forgiveness & Gratitude', 'Forgive one person and thank another.', 'sun', 'karma-09.webp'),
  ('karma', 10, 'Responsibility', 'It starts with you. Own one outcome fully.', 'shield-check', 'karma-10.webp'),
  ('karma', 11, 'Conscious Choice', 'Make one choice slowly and on purpose.', 'signpost', 'karma-11.webp'),
  ('karma', 12, 'God Vs Free Will', 'Reflect on what is yours to do and what to surrender.', 'sparkles', 'karma-12.webp'),
  ('karma', 13, 'Mango Seed', 'Plant a seed today whose fruit others will eat.', 'sprout', 'karma-13.webp'),
  ('karma', 14, 'Salliyan Vs Karma Veerar Kamarajar', 'Act like Kamarajar: serve without seeking credit.', 'crown', 'karma-14.webp'),
  ('karma', 15, 'Offering - Liberation', 'Offer your work and let go of the result.', 'flame', 'karma-15.webp'),
  ('karma', 16, 'Benevolence - Selflessness', 'Do one good deed that expects nothing back.', 'hand-heart', 'karma-16.webp'),
  ('champion', 1, 'Winning Cup - Be Your Best Self', 'Play to your own best, not someone else’s.', 'trophy', 'champion-01.webp'),
  ('champion', 2, 'Challenges / Risks - Part of Game', 'Take on one challenge you’d usually avoid.', 'mountain', 'champion-02.webp'),
  ('champion', 3, 'Burning Desire - Dream Big', 'Revisit your big dream and act on it.', 'rocket', 'champion-03.webp'),
  ('champion', 4, 'Willpower - Never Give Up', 'Push through one moment you wanted to quit.', 'zap', 'champion-04.webp'),
  ('champion', 5, 'Nothing Is Impossible - Keep Trying New', 'Try one new approach today.', 'sparkle', 'champion-05.webp'),
  ('champion', 6, 'Process - Steps - Don''t Cut Corners', 'Follow every step. No shortcuts.', 'trending-up', 'champion-06.webp'),
  ('champion', 7, 'Enjoy Pain - No Pain No Gain', 'Welcome the discomfort of growth.', 'dumbbell', 'champion-07.webp'),
  ('champion', 8, 'Collective Responsibility', 'Lift your team, not just yourself.', 'users', 'champion-08.webp'),
  ('champion', 9, 'Sportsmanship - Learn from Competitors', 'Learn one thing from someone ahead of you.', 'handshake', 'champion-09.webp'),
  ('champion', 10, 'Preparation - Practice - Push Consistently', 'Practise your craft, even on a slow day.', 'target', 'champion-10.webp'),
  ('champion', 11, 'No Ego - No Fear - Make Country Proud', 'Act for something bigger than yourself.', 'flag', 'champion-11.webp'),
  ('champion', 12, 'Physical Fitness - Diet', 'Train your body and eat clean.', 'apple', 'champion-12.webp'),
  ('champion', 13, 'Perform Under Pressure - Last Minute Comeback', 'Stay calm when the clock is against you.', 'timer', 'champion-13.webp'),
  ('champion', 14, 'Self Worth - Emotional Detachment', 'Know your worth without needing approval.', 'gem', 'champion-14.webp'),
  ('champion', 15, 'Focus Next Ball - Present Moment - Meditation', 'Let go of the last ball. Focus on this one.', 'circle-dot', 'champion-15.webp'),
  ('champion', 16, 'Self Awareness - Self Control', 'Notice your urges and choose your actions.', 'eye', 'champion-16.webp')
) as v(slug, number, default_name, description, icon, image_path)
join public.tracker_categories c on c.slug = v.slug
on conflict (category_id, number) do nothing;   -- never overwrite names or coach edits

insert into public.achievements(code, name, description, glyph, color_from, color_to, sort_order) values
  ('first_activity', 'First Activity', 'Tick your first habit', '1', '#f7e5a6', '#b8892f', 1),
  ('streak_7', '7-Day Streak', '7 days in a row', '7', '#ffd29a', '#e0782e', 2),
  ('consistency_30', '30-Day Consistency', '30 days in a row', '30', '#d4dcff', '#5b7fe0', 3),
  ('transformation_60', '60-Day Transformation', '60 days in a row', '60', '#c9f2dc', '#2f9a68', 4),
  ('champion_90', '90-Day Champion', '90 days in a row', '90', '#f7e5a6', '#9a7227', 5),
  ('wealth_master', 'Wealth Master', 'All 16 Wealth Habits done on 7 different days', 'W', '#f7e5a6', '#9a7227', 6),
  ('karma_star', 'Karma Star', 'All 16 Karma Activities done on 7 different days', 'K', '#ffc9a0', '#d0612b', 7),
  ('champion_mindset', 'Champion Mindset', 'All 16 Champion Mindsets done on 7 different days', 'C', '#bcd0ff', '#2d4aa8', 8),
  ('perfect_week', 'Perfect Week', 'Every habit, every day, Monday to Sunday', '★', '#c9f2dc', '#2f9a68', 9),
  ('monthly_champion', 'Monthly Champion', 'Finish a month at #1 on the leaderboard', 'M', '#f7e5a6', '#9a7227', 10)
on conflict (code) do update set name = excluded.name, description = excluded.description,
  glyph = excluded.glyph, color_from = excluded.color_from, color_to = excluded.color_to, sort_order = excluded.sort_order;
