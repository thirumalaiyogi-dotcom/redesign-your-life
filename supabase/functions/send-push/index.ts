// send-push — delivers not-yet-pushed rows of public.notifications to members' phones (Web Push).
// Safe to call any number of times: each row is claimed once (pushed_at) before sending.
// The VAPID private key is read from Supabase Vault (public._push_config(), service role only); the public key
// matches js/push.js. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase and never leave this function.
// Deploy with "Verify JWT" OFF: it takes no input and only sends what the database already queued.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const VAPID_PUBLIC_KEY = 'BAU_N4h6VR07b0bRPoxI-pOrdyDPkDla7ZQ6mGOWp2Nrn_EGW700V8FRh-0eJbK2nmveODgPlRo3AM0PpX2eDFg';
let ready = false;
async function setup() {
  if (ready) return;
  const { data, error } = await db.rpc('_push_config');
  if (error || !data?.private) throw new Error('VAPID key missing in Vault');
  webpush.setVapidDetails(data.subject, VAPID_PUBLIC_KEY, data.private);
  ready = true;
}

const LINK: Record<string, string> = { reminder: 'member/dashboard.html', bonus: 'member/progress.html', achievement: 'member/progress.html', void: 'member/trackers.html', info: 'member/dashboard.html' };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  try { await setup(); } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500 }); }
  // claim up to 300 recent rows atomically, so parallel calls never double-send
  const { data: rows, error } = await db.rpc('_claim_push_batch', { p_limit: 300 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  let sent = 0, gone = 0;
  const subsBy = new Map<string, any[]>();
  const ids = [...new Set((rows || []).map((r: any) => r.member_id))];
  if (ids.length) {
    const { data: subs } = await db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth').in('member_id', ids);
    for (const s of subs || []) { if (!subsBy.has(s.member_id)) subsBy.set(s.member_id, []); subsBy.get(s.member_id)!.push(s); }
  }
  for (const n of rows || []) {
    let url = LINK[n.kind] || 'member/dashboard.html';
    if (/answered your question|New session:/.test(n.title)) url = 'member/learn.html' + (n.title.startsWith('New session') ? '' : '?tab=questions');
    if (/to-do|To-do/.test(n.title)) url = 'member/todo.html';
    if (n.title.startsWith('New question from')) url = 'admin/sessions.html?tab=questions';   // coaches
    const payload = JSON.stringify({ title: n.title, body: n.body || '', url, tag: n.kind + '-' + n.id });
    for (const s of subsBy.get(n.member_id) || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
        sent++; await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id);
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) { gone++; await db.from('push_subscriptions').delete().eq('id', s.id); }
      }
    }
  }
  return new Response(JSON.stringify({ notifications: rows?.length || 0, sent, removed: gone }), { headers: { 'Content-Type': 'application/json' } });
});
