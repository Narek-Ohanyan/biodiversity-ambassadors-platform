// Data layer: one Supabase client, cached session/profile state and thin wrappers around the RPC functions.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { ACTIVITY_TEXT } from './catalog.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

export const state = {
  user: null,        // auth user
  account: null,     // { id, email, role }
  profile: null,     // own profile row (ambassadors)
  progress: null,    // credit progress (ambassadors)
  config: null,      // categories / activities / deadline / unicef modules
  unread: 0,
  pendingClaims: 0,
  unreadContact: 0,
};

const unwrap = ({ data, error }) => { if (error) throw error; return data; };

export const photoUrl = (path) => (path ? `${SUPABASE_URL}/storage/v1/object/public/photos/${path}` : null);

// ── boot ────────────────────────────────────────────────────────────────────
export async function loadConfig(force = false) {
  if (state.config && !force) return state.config;
  const [cats, acts, settings] = await Promise.all([
    sb.from('categories').select('*'), sb.from('activities').select('*').order('sort'), sb.from('settings').select('*'),
  ]);
  const s = Object.fromEntries(unwrap(settings).map((r) => [r.key, r.value]));
  state.config = {
    categories: Object.fromEntries(unwrap(cats).map((c) => [c.key, c])),
    activities: unwrap(acts).map((a) => ({ ...a, ...ACTIVITY_TEXT[a.key] })),
    displayDeadline: s.display_deadline,
    systemDeadline: s.system_deadline,
    modules: [],
  };
  return state.config;
}
export const isLocked = () => !!state.config && Date.now() > new Date(state.config.systemDeadline).getTime();

export async function loadUser() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user ?? null;
  state.account = state.profile = state.progress = null;
  if (!state.user) return;
  const { data: account } = await sb.from('accounts').select('*').eq('id', state.user.id).maybeSingle();
  state.account = account;
  if (account?.role === 'ambassador') await refreshMe();
}

export async function refreshMe() {
  if (!state.user) return;
  const [p, prog] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', state.user.id).maybeSingle(),
    sb.rpc('my_progress'),
  ]);
  state.profile = unwrap(p);
  state.progress = unwrap(prog);
}


// ── auth ────────────────────────────────────────────────────────────────────
export const signIn = (email, password) => sb.auth.signInWithPassword({ email, password }).then(unwrap);
export const signUp = (email, password) =>
  sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/platform` } }).then(unwrap);
export const signOut = () => sb.auth.signOut();
export const sendReset = (email) =>
  sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/platform/reset` }).then(unwrap);
export const setPassword = (password) => sb.auth.updateUser({ password }).then(unwrap);
export const recordLogin = () => sb.rpc('record_login');

// ── public ──────────────────────────────────────────────────────────────────
export const publicAmbassadors = () => sb.rpc('public_ambassadors').then(unwrap);
export const submitContact = (f) =>
  sb.rpc('submit_contact', { p_name: f.name, p_email: f.email, p_subject: f.subject, p_message: f.message }).then(unwrap);

// ── ambassador ──────────────────────────────────────────────────────────────
export async function saveProfile(values, photoBlob) {
  const uid = state.user.id;
  let photo_path = state.profile?.photo_path ?? null;
  if (photoBlob) {
    const path = `${uid}/${Date.now()}.jpg`;
    const up = await sb.storage.from('photos').upload(path, photoBlob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw up.error;
    if (photo_path) sb.storage.from('photos').remove([photo_path]);
    photo_path = path;
  }
  const row = { user_id: uid, ...values, photo_path };
  unwrap(await sb.from('profiles').upsert(row, { onConflict: 'user_id' }));
  await refreshMe();
}

export const myClaims = () => sb.from('claims').select('*, claim_files(id)').eq('user_id', state.user.id).order('created_at', { ascending: false }).then(unwrap);
// UNICEF course: sequential modules, each with a locked video series and a quiz. All enforcement
// (no skipping ahead, no jumping modules, quiz answer key) lives server-side — see the migration.
export const myUnicefStatus = () => sb.rpc('my_unicef_status').then(unwrap);
export const reportVideoProgress = (video, time, duration) =>
  sb.rpc('report_video_progress', { p_video: video, p_time: time, p_duration: duration ?? null }).then(unwrap);
export const submitQuiz = (module, answers) => sb.rpc('submit_quiz', { p_module: module, p_answers: answers }).then(unwrap);
export const unicefQuizQuestions = (module) =>
  sb.from('unicef_quiz_questions').select('id,module_id,sort,question_en,question_hy,options').eq('module_id', module).order('sort').then(unwrap);

export async function uploadCertificates(files) {
  const uid = state.user.id;
  const out = [];
  for (const file of files) {
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${uid}/${crypto.randomUUID()}-${safe}`;
    const { sha256Hex } = await import('./lib.js');
    const sha = await sha256Hex(file);
    const up = await sb.storage.from('certificates').upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) throw up.error;
    out.push({ path, name: file.name, mime: file.type, size: file.size, sha256: sha });
  }
  return out;
}

export async function submitClaim(activity, form, files) {
  const id = unwrap(await sb.rpc('submit_claim', { p_activity: activity, p_form: form || {}, p_files: files || [] }));
  await refreshMe();
  return id;
}
// Fire and forget: the scan verdict shows up on the manager's claim page.
export async function scanCertificate(claimId) {
  for (const wait of [0, 2500, 6000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const { data, error } = await sb.functions.invoke('scan-certificate', { body: { claim_id: claimId } });
      if (!error && data?.ok) return data;
    } catch { /* retry */ }
  }
}

// ── notifications (both roles) ──────────────────────────────────────────────
export const listNotifications = () => sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100).then(unwrap);
export const markRead = (ids = null) => sb.rpc('mark_read', { p_ids: ids }).then(unwrap);
export const markPopupsSeen = (ids) => sb.rpc('mark_popups_seen', { p_ids: ids }).then(unwrap);
export const pendingPopups = () =>
  sb.from('notifications').select('*').eq('popup', true).is('popup_seen_at', null).order('created_at').limit(10).then(unwrap);
export async function refreshCounts() {
  if (!state.user) return;
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  state.unread = count || 0;
  if (state.account?.role === 'manager') {
    const o = unwrap(await sb.rpc('manager_overview'));
    state.pendingClaims = o.pending_claims; state.unreadContact = o.unread_contact;
  }
}

// ── manager ─────────────────────────────────────────────────────────────────
export const mgr = {
  overview: () => sb.rpc('manager_overview').then(unwrap),
  ambassadors: () => sb.rpc('manager_ambassadors').then(unwrap),
  ambassador: (id) => sb.rpc('manager_ambassador', { p_id: id }).then(unwrap),
  claims: (status = null) => sb.rpc('manager_claims', { p_status: status }).then(unwrap),
  decide: (id, decision, credits, comment) =>
    sb.rpc('decide_claim', { p_claim: id, p_decision: decision, p_credits: credits ?? null, p_comment: comment || null }).then(unwrap),
  signedUrl: async (path) => unwrap(await sb.storage.from('certificates').createSignedUrl(path, 600)).signedUrl,
  rescan: (claimId) => sb.functions.invoke('scan-certificate', { body: { claim_id: claimId } }),
  resetPassword: async (userId, password) => {
    const { data, error } = await sb.functions.invoke('manager-reset-password', { body: { user_id: userId, password } });
    if (error) {
      let detail = error.message;
      try { detail = (await error.context.json()).error || detail; } catch { /* keep message */ }
      throw new Error(detail);
    }
    return data;
  },
  audienceCount: (aud) => sb.rpc('audience_count', { p_audience: aud }).then(unwrap),
  announce: (m) => sb.rpc('send_announcement', {
    p_title_en: m.title_en, p_title_hy: m.title_hy, p_body_en: m.body_en, p_body_hy: m.body_hy, p_audience: m.audience,
  }).then(unwrap),
  announcements: () => sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(100).then(unwrap),
  contact: () => sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200).then(unwrap),
  contactRead: (id) => sb.rpc('mark_contact_read', { p_id: id }).then(unwrap),
  batches: () => sb.from('checkin_batches').select('*').order('uploaded_at', { ascending: false }).then(unwrap),
  records: (limit = 300) => sb.from('checkin_records').select('id,name,email,raw,batch_id').order('id', { ascending: false }).limit(limit).then(unwrap),
  deleteBatch: (id) => sb.from('checkin_batches').delete().eq('id', id).then(unwrap),
  async importCheckins(filename, records) {
    const batch = unwrap(await sb.from('checkin_batches').insert({ filename, rows: records.length }).select().single());
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500).map((r) => ({ batch_id: batch.id, name: r.name, email: r.email, raw: r.raw }));
      unwrap(await sb.from('checkin_records').insert(chunk));
    }
    return batch;
  },
};
