// Coordinator room: a read-only section for ambassadors approved on the Coordinators team. It lists every team with
// its members and contacts, and embeds the schedule summary and each ambassador's calendar (the same views the
// managers use). It never changes anything and is separate from the coordinator's own Roles and Schedule pages.
import { t } from './i18n.js';
import { html, raw, actions, openModal, errText, debounce, fmtDateTime } from './lib.js';
import * as api from './api.js';
import { localUniversity } from './pages-public.js';
import { TEAM_ORDER, teamName, teamColor } from './teams.js';
import { scheduleViewWith, personCalendar, loadShifts, roleStatusChip } from './pages-manager.js';

const fullName = (a) => `${a.first_name || ''} ${a.last_name || ''}`.trim();

export async function coordinatorRoomView() {
  const d = await api.coordinatorRoles();
  const cfgMap = Object.fromEntries(d.roles.map((r) => [r.role, r]));
  const sched = await scheduleViewWith({ roles: () => Promise.resolve(d), shifts: api.coordinatorShifts, embedded: true });
  let query = '';
  const rowsOf = (key) => d.rows.filter((r) => r.role === key
    && (!query || `${fullName(r)} ${r.first_name_en || ''} ${r.last_name_en || ''} ${r.email} ${r.public_email || ''} ${r.university || ''}`.toLowerCase().includes(query)));
  const section = (cfg) => {
    const rows = rowsOf(cfg.role);
    return html`<details class="card team-sec" data-role="${cfg.role}" style="--c:${teamColor(cfg.role)}" ${query && rows.length ? raw('open') : ''}>
      <summary><span class="dot big"></span><b>${teamName(cfg.role)}</b>
        <span class="chip ok">✓ ${cfg.approved}/${cfg.capacity ?? t('roles.tbd')}</span><span class="chip pending">${t('mgr.rs_pending', { n: cfg.pending })}</span>
        ${cfg.min_hours ? html`<span class="chip neutral">⏱ ${t('roles.min_hours', { n: cfg.min_hours })}</span>` : ''}</summary>
      ${rows.length ? html`<div class="table-wrap" style="margin-top:.6rem"><table><thead><tr><th>${t('mgr.ambassador')}</th><th>${t('profile.university')}</th><th>${t('coord.contact')}</th><th>${t('mgr.status')}</th><th>${t('cal.hours')}</th><th></th></tr></thead><tbody>
        ${rows.map((r) => html`<tr><td><b>${fullName(r) || '—'}</b></td><td class="small">${r.university ? localUniversity(r.university) : '—'}</td>
          <td class="small"><a href="mailto:${r.email}">${r.email}</a>${r.public_email && r.public_email !== r.email ? html`<br><a href="mailto:${r.public_email}">${r.public_email}</a>` : ''}</td>
          <td>${roleStatusChip(r.status)}</td><td>${r.hours || '—'}</td>
          <td><button class="btn ghost sm" type="button" data-act="coord-cal" data-id="${r.id}">📅</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="empty" style="margin-top:.6rem">${t('roles.none')}</div>`}</details>`;
  };
  const list = () => d.roles.slice().sort((a, b) => TEAM_ORDER.indexOf(a.role) - TEAM_ORDER.indexOf(b.role)).map(section);
  return {
    html: html`<div class="main-head"><h1>${t('nav.coordinator')}</h1></div>
      <p class="muted" style="max-width:760px">${t('coord.intro')}</p>
      <div class="chips" style="margin-bottom:1rem"><a class="chip info" href="#coord-teams">${t('coord.teams')}</a><a class="chip info" href="#coord-sched">${t('coord.schedule')}</a></div>
      <section id="coord-teams"><h2 style="font-size:1.4rem">${t('coord.teams')}</h2>
        <div class="toolbar"><input type="search" id="coord-q" placeholder="${t('coord.search')}" aria-label="${t('coord.search')}"></div>
        <div class="team-list" id="coord-secs">${list()}</div></section>
      <section id="coord-sched" style="margin-top:2.2rem"><h2 style="font-size:1.4rem">${t('coord.schedule')}</h2>${sched.html}</section>`,
    mount(root) {
      sched.mount(root);
      const box = root.querySelector('#coord-secs'), open = new Set();
      box.addEventListener('toggle', (e) => { const k = e.target.dataset?.role; if (k) (e.target.open ? open.add(k) : open.delete(k)); }, true);
      root.querySelector('#coord-q').addEventListener('input', debounce((e) => {
        query = e.target.value.toLowerCase().trim();
        box.innerHTML = list().map((x) => x.s).join('');
      }, 150));
      actions['coord-cal'] = async (el) => {
        const uid = el.dataset.id, r = d.rows.find((x) => x.id === uid);
        const m = openModal({ title: `${fullName(r)} — ${t('mgr.schedule')}`, wide: true, body: html`<div class="loading"><span class="spinner"></span></div>` });
        try { await loadShifts(true, api.coordinatorShifts); m.el.querySelector('.modal-body').innerHTML = personCalendar(uid, d.rows, cfgMap).s; }
        catch (e) { m.el.querySelector('.modal-body').innerHTML = html`<div class="form-error">${errText(e)}</div>`.s; }
      };
    },
  };
}
