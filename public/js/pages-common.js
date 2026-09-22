// Notifications: shared by ambassador and manager, plus the pop-up announcement queue.
import { t, getLang } from './i18n.js';
import { html, actions, openModal, localName, fmtDateTime, toast, errText } from './lib.js';
import * as api from './api.js';
import { state } from './api.js';
import { navigate } from './router.js';

const activityName = (key) => localName(state.config?.activities?.find((a) => a.key === key)) || key;

// Turns a stored notification (type + params) into display text in the current language.
export function notifText(n) {
  const L = getLang(), p = n.params || {};
  switch (n.type) {
    case 'announcement':
      return { icon: '📣', title: p[`title_${L}`] || p.title_en || p.title_hy, body: p[`body_${L}`] || p.body_en || p.body_hy };
    case 'claim_approved':
      return { icon: '✅', title: t('n.approved_title'), href: '/app/learning',
        body: [t('n.approved_body', { activity: activityName(p.activity), credits: p.credits }), p.comment].filter(Boolean).join('\n') };
    case 'claim_rejected':
      return { icon: '⚠️', title: t('n.rejected_title'), href: '/app/learning',
        body: [t('n.rejected_body', { activity: activityName(p.activity) }), p.comment].filter(Boolean).join('\n') };
    case 'qualified':
      return { icon: '🎉', title: t('n.qualified_title'), body: t('n.qualified_body'), href: '/app/profile' };
    case 'claim_submitted':
      return { icon: '📥', title: t('n.submitted_title'), body: t('n.submitted_body', { name: p.name || '—', activity: activityName(p.activity) }), href: '/manager/claims' };
    case 'qualified_manager':
      return { icon: '🎉', title: t('n.qualified_mgr_title'), body: t('n.qualified_mgr_body', { name: p.name || '—' }), href: '/manager/ambassadors' };
    case 'contact_message':
      return { icon: '✉️', title: t('n.contact_title'), body: t('n.contact_body', { name: p.name || '—' }), href: '/manager/inbox' };
    default:
      return { icon: '🔔', title: n.type, body: '' };
  }
}

export async function notificationsView() {
  const list = await api.listNotifications();
  return {
    html: html`<div class="main-head"><h1>${t('nav.notifications')}</h1><div class="grow"></div>
        ${list.some((n) => !n.read_at) ? html`<button class="btn secondary sm" type="button" data-act="notif-read-all">${t('notif.mark_all')}</button>` : ''}</div>
      ${list.length ? list.map((n) => {
        const x = notifText(n);
        return html`<article class="notif ${n.read_at ? '' : 'unread'}" data-id="${n.id}">
          <div class="ic" aria-hidden="true">${x.icon}</div>
          <div><h4>${x.title}</h4>${x.body ? html`<p>${x.body}</p>` : ''}<div class="muted small" style="margin-top:.3rem">${fmtDateTime(n.created_at)}</div></div>
          <div class="row">${x.href ? html`<button class="btn ghost sm" type="button" data-act="notif-open" data-id="${n.id}" data-href="${x.href}">${t('notif.open')} →</button>` : ''}
            ${n.read_at ? '' : html`<button class="btn ghost sm" type="button" data-act="notif-read" data-id="${n.id}">${t('notif.mark_read')}</button>`}</div></article>`;
      }) : html`<div class="empty">${t('notif.empty')}</div>`}`,
    mount() {
      const refresh = async () => { await api.refreshCounts(); updateBadges(); navigate(location.pathname); };
      actions['notif-read'] = async (el) => { await api.markRead([Number(el.dataset.id)]); refresh(); };
      actions['notif-read-all'] = async () => { await api.markRead(null); refresh(); };
      actions['notif-open'] = async (el) => { await api.markRead([Number(el.dataset.id)]); await api.refreshCounts(); navigate(el.dataset.href); };
    },
  };
}

export function updateBadges() {
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const n = { notifications: state.unread, claims: state.pendingClaims, inbox: state.unreadContact }[el.dataset.badge] || 0;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  });
}

// Announcements and milestone messages appear as a pop-up on whatever page the ambassador is on.
let popupBusy = false;
export async function checkPopups() {
  if (popupBusy || !state.user) return;
  let list;
  try { list = await api.pendingPopups(); } catch { return; }
  if (!list.length) return;
  popupBusy = true;
  for (const n of list) {
    const x = notifText(n);
    await new Promise((resolve) => {
      const m = openModal({
        title: x.title || '', dismissible: true, onClose: resolve,
        body: html`${n.type === 'qualified' ? html`<div class="popup-celebrate" aria-hidden="true">🎉</div>` : ''}
          <p style="white-space:pre-line">${x.body}</p>
          <div class="muted small">${fmtDateTime(n.created_at)}</div>`,
        footer: html`${x.href ? html`<button class="btn secondary" type="button" data-go="${x.href}">${t('notif.open')}</button>` : ''}<button class="btn" type="button" data-modal-close>${t('common.got_it')}</button>`,
      });
      m.el.querySelector('[data-go]')?.addEventListener('click', (e) => { m.close(); navigate(e.currentTarget.dataset.go); });
    });
    await api.markPopupsSeen([n.id]).catch(() => {});
  }
  popupBusy = false;
  await api.refreshCounts(); updateBadges();
}
