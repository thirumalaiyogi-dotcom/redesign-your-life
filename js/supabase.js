// Supabase client — Deepak's Redesign Your Life
// The anon key is designed to be public; all data is protected by the
// Row Level Security policies in supabase/policies.sql.
// NEVER put the service_role key in any file in this folder.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const SUPABASE_URL = 'https://gcbizlnpryihrrmjwbdv.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYml6bG5wcnlpaHJybWp3YmR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MjM0NjYsImV4cCI6MjEwOTQ5OTQ2Nn0.MVwEg7dP0ivSxtVyy58uV1brPfbdIGlaYhhpUTRwIHM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// Activity images: bundled files live in /assets/images/, coach uploads live in Storage.
export function activityImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `/assets/images/${path}`;
}
