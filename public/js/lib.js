// Small UI toolkit: escaped HTML templates, modals, toasts, formatting.
import { t, getLang } from './i18n.js';
import { SKILLS, LANGUAGES, PROFICIENCY } from './catalog.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const render = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : v === null || v === undefined || v === false ? '' : esc(v));
// Tagged template: every interpolated value is HTML-escaped unless it is itself the result of html``.
export const html = (strings, ...vals) => {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += render(vals[i]); });
  return new Raw(out);
};

export const safeUrl = (u) => (/^https?:\/\/[^\s]+$/i.test(String(u || '')) ? u : '#');
export const wordCount = (s) => (String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0);
export const debounce = (fn, ms = 250) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
export const initials = (a, b) => `${(a || '').trim()[0] || ''}${(b || '').trim()[0] || ''}`.toUpperCase() || '·';
export const localName = (o) => o?.[getLang()] || o?.en || o?.hy || '';

const HY_MONTHS = ['հունվարի', 'փետրվարի', 'մարտի', 'ապրիլի', 'մայիսի', 'հունիսի', 'հուլիսի', 'օգոստոսի', 'սեպտեմբերի', 'հոկտեմբերի', 'նոյեմբերի', 'դեկտեմբերի'];
// Armenian dates are formatted by hand: browsers often ship without Armenian locale data.
const hyDate = (d) => `${d.getDate()} ${HY_MONTHS[d.getMonth()]} ${d.getFullYear()}թ.`;
const pad = (n) => String(n).padStart(2, '0');

export function fmtDate(iso, opts = { dateStyle: 'medium' }) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return getLang() === 'hy' ? hyDate(d) : d.toLocaleDateString('en-GB', opts);
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return getLang() === 'hy' ? `${hyDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}` : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

// Turn a Supabase/Postgres error into a friendly, translated message.
export function errText(err) {
  const msg = String(err?.message || err || '');
  const code = (msg.match(/\b[a-z]+(?:_[a-z]+)+\b/) || [])[0];
  if (code && t.has(`err.${code}`)) return t(`err.${code}`);
  if (/Invalid login credentials/i.test(msg)) return t('err.invalid_login');
  if (/Email not confirmed/i.test(msg)) return t('err.email_not_confirmed');
  if (/already registered|already been registered/i.test(msg)) return t('err.already_registered');
  if (/rate limit|too many/i.test(msg)) return t('err.rate_limited');
  if (/Password should be at least/i.test(msg)) return t('err.weak_password');
  if (/fetch|network/i.test(msg)) return t('err.network');
  return msg || t('err.generic');
}

export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'ok' ? '' : 'bad'}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// Modal. `body` and `footer` are html`` fragments. Returns { el, close }.
export function openModal({ title, body, footer, wide = false, dismissible = true, onClose }) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <header><h3>${title}</h3>${dismissible ? html`<button class="icon-btn" type="button" data-modal-close aria-label="${t('common.close')}">×</button>` : ''}</header>
    <div class="modal-body">${body}${footer ? html`<div class="modal-foot">${footer}</div>` : ''}</div></div>`.s;
  const prevFocus = document.activeElement;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape' && dismissible && el === [...document.querySelectorAll('.modal-backdrop')].pop()) close(); };
  el.addEventListener('mousedown', (e) => { if (dismissible && e.target === el) close(); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-modal-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  el.querySelector('input:not([type=hidden]), select, textarea, button.btn')?.focus();
  return { el, close };
}

export function confirmDialog({ title, message, confirmText, danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, body: html`<p>${message}</p>`, onClose: () => { if (!done) resolve(false); },
      footer: html`<button class="btn secondary" data-modal-close type="button">${t('common.cancel')}</button>
        <button class="btn ${danger ? 'danger' : ''}" data-confirm type="button">${confirmText || t('common.confirm')}</button>`,
    });
    m.el.querySelector('[data-confirm]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${esc(label || '')}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

export async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Downscale a profile photo in the browser (keeps uploads small and strips EXIF).
export function resizeImage(file, max = 640, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('image_error'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid_image')); };
    img.src = url;
  });
}

// Global delegated handlers: views register `actions[name] = (el, event) => ...` and `forms[name] = (form, event) => ...`.
export const actions = {};
export const forms = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { actions[el.dataset.act](el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-on-change]');
  if (el && actions[el.dataset.onChange]) actions[el.dataset.onChange](el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (f) { e.preventDefault(); forms[f.dataset.form]?.(f, e); }
});

// Labels for stored profile values (keys for the predefined lists, `other:text` for free-text entries).
export const skillLabel = (s) => { const f = SKILLS.find((x) => x.key === s); return f ? f[getLang()] : String(s).replace(/^other:/, ''); };
export const langLabel = (l) => { const f = LANGUAGES.find((x) => x.key === l.lang); return f ? f[getLang()] : (l.name || l.lang); };
export const profLabel = (k) => { const f = PROFICIENCY.find((x) => x.key === k); return f ? f[getLang()] : k; };
