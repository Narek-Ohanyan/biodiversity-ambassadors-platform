import { t, getLang, setLang } from './i18n.js';
import { actions, html, toast } from './lib.js';
import * as api from './api.js';
import { state, sb } from './api.js';
import { BRAND_NAME } from './config.js';
import { setRouter, navigate } from './router.js';
import { publicShell, ambassadorShell, managerShell } from './layouts.js';
import * as pub from './pages-public.js';
import * as amb from './pages-ambassador.js';
import * as mgr from './pages-manager.js';
import { notificationsView, updateBadges, checkPopups } from './pages-common.js';

const app = document.getElementById('app');
let renderToken = 0;

// path -> { view, title key, shell }
const ROUTES = {
  '/': { view: pub.homeView, title: 'nav.home', shell: 'public' },
  '/about': { view: pub.aboutView, title: 'nav.about', shell: 'public' },
  '/platform': { view: pub.platformView, title: 'nav.platform', shell: 'public' },
  '/platform/reset': { view: pub.resetView, title: 'auth.reset_title', shell: 'public' },
  '/ambassadors': { view: pub.ambassadorsView, title: 'nav.ambassadors', shell: 'public' },
  '/contact': { view: pub.contactView, title: 'nav.contact', shell: 'public' },
  '/app/profile': { view: amb.profileView, title: 'nav.profile', shell: 'ambassador', role: 'ambassador' },
  '/app/notifications': { view: notificationsView, title: 'nav.notifications', shell: 'ambassador', role: 'ambassador' },
  '/app/learning': { view: amb.learningView, title: 'nav.learning', shell: 'ambassador', role: 'ambassador', needsProfile: true },
  '/app/unicef': { view: amb.unicefView, title: 'unicef.title', shell: 'ambassador', role: 'ambassador', needsProfile: true },
  '/manager': { view: mgr.overviewView, title: 'mgr.overview', shell: 'manager', role: 'manager' },
  '/manager/ambassadors': { view: mgr.mgrAmbassadorsView, title: 'mgr.ambassadors', shell: 'manager', role: 'manager' },
  '/manager/claims': { view: mgr.claimsView, title: 'mgr.claims', shell: 'manager', role: 'manager' },
  '/manager/checkins': { view: mgr.checkinsView, title: 'mgr.checkins', shell: 'manager', role: 'manager' },
  '/manager/messages': { view: mgr.messagesView, title: 'mgr.messages', shell: 'manager', role: 'manager' },
  '/manager/inbox': { view: mgr.inboxView, title: 'mgr.inbox', shell: 'manager', role: 'manager' },
  '/manager/notifications': { view: notificationsView, title: 'nav.notifications', shell: 'manager', role: 'manager' },
  '/manager/account': { view: mgr.mgrAccountView, title: 'mgr.account', shell: 'manager', role: 'manager' },
};

async function route() {
  const token = ++renderToken;
  let path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/app') path = state.profile?.completed ? '/app/learning' : '/app/profile';
  let def = ROUTES[path];
  if (!def) { def = { view: () => ({ html: html`<div class="container section center"><h1>404</h1><p class="muted">${t('common.not_found')}</p><a class="btn" href="/" data-link>${t('nav.home')}</a></div>` }), title: 'nav.home', shell: 'public' }; }

  // access control (the database enforces the same rules; this only decides what to show)
  if (def.role) {
    if (!state.user || !state.account) return navigate('/platform', { replace: true });
    if (state.account.role !== def.role) return navigate(state.account.role === 'manager' ? '/manager' : '/app', { replace: true });
    if (def.role === 'ambassador' && def.needsProfile && !state.profile?.completed) return navigate('/app/profile', { replace: true });
  }

  document.title = `${t(def.title)} · ${BRAND_NAME}`;
  document.documentElement.lang = getLang();
  document.body.classList.toggle('is-platform-page', path === '/platform');
  if (!app.innerHTML.trim()) app.innerHTML = html`<div class="loading"><span class="spinner"></span></div>`.s;
  let view;
  try { view = await def.view(); }
  catch (e) { console.error(e); view = { html: html`<div class="container section"><div class="form-error">${t('err.generic')}: ${e.message}</div></div>` }; }
  if (token !== renderToken) return; // a newer navigation superseded this one

  const shells = { public: publicShell, ambassador: ambassadorShell, manager: managerShell };
  app.innerHTML = shells[def.shell](view.html, path).s;
  window.scrollTo(0, 0);
  view.mount?.(app);
  updateBadges();
  if (state.user) checkPopups();
}

// ── global actions ──────────────────────────────────────────────────────────
actions['set-lang'] = (el) => { setLang(el.dataset.lang); route(); };
actions['menu-toggle'] = (el) => {
  const nav = document.getElementById('main-nav'); const open = nav.classList.toggle('open'); el.setAttribute('aria-expanded', String(open));
};
actions['sidebar-toggle'] = () => document.getElementById('sidebar')?.classList.toggle('open');
actions.logout = async () => { await api.signOut(); await api.loadUser(); stopPolling(); navigate('/'); };

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  if (a.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
  e.preventDefault();
  document.getElementById('sidebar')?.classList.remove('open');
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', route);
setRouter(route);

// ── polling: unread counts + pop-up announcements ───────────────────────────
let poll;
function startPolling() {
  stopPolling();
  const tick = async () => {
    if (!state.user || document.hidden) return;
    try { await api.refreshCounts(); updateBadges(); await checkPopups(); } catch { /* offline */ }
  };
  api.refreshCounts().then(updateBadges).catch(() => {});
  poll = setInterval(tick, 25000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}
function stopPolling() { clearInterval(poll); poll = null; }

// ── boot ────────────────────────────────────────────────────────────────────
(async function boot() {
  try {
    await api.loadConfig();
    await api.loadUser();
  } catch (e) { console.error(e); toast(t('err.network'), 'bad'); }

  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') navigate('/platform/reset', { replace: true });
    if (event === 'SIGNED_OUT') { state.user = state.account = state.profile = state.progress = null; stopPolling(); }
    if (event === 'SIGNED_IN' && !poll) setTimeout(async () => { await api.loadUser(); startPolling(); }, 0);
  });
  if (state.user) { api.recordLogin(); startPolling(); }
  await route();
})();
