// Cover picture for each tracker. The coach can set one (tracker_categories.cover_path, Admin → Programs → Trackers);
// otherwise the built-in picture below; otherwise a coloured poster with the tracker's icon.
import { app, activityImageUrl } from './supabase.js';

export const COVER = { wealth: 'wealth-01.webp', conscious: 'conscious-02.webp', karma: 'karma-01.webp', champion: 'champion-01.webp', couple: 'couple-cover.webp', mugilan: 'mugilan-cover.webp', nithilla: 'nithilla-cover.webp', secret: 'secret-cover.webp', attraction: 'attraction-cover.webp', money: 'money-cover.webp' };

export function coverSrc(cat) {
  if (!cat) return null;
  if (cat.cover_path) return activityImageUrl(cat.cover_path);
  return COVER[cat.slug] ? app('assets/images/' + COVER[cat.slug]) : null;
}
