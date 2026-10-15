// Shared calendar pieces: a day x hour grid, drag-to-paint, and the workload check. Used by the ambassador's
// schedule editor and by the manager's individual and summary calendars.
import { html, raw } from './lib.js';
import { t } from './i18n.js';
import { EVENT_DAYS, HOURS, dayParts, hourLabel, teamName, teamColor, TEAMS } from './teams.js';

export const slotKey = (day, hour) => `${day}|${hour}`;

// cell(day, hour) -> { cls, style, text, title }.  dayExtra(day) -> html shown under the day name.
// dimHour(hour) -> true to fade a row (e.g. outside the hours that need cover).
export function calGrid({ cell, dayExtra = () => '', dimHour = () => false, interactive = false, label = '' }) {
  return html`<div class="cal-wrap"><div class="cal ${interactive ? 'cal-edit' : ''}" role="grid" aria-label="${label}">
    <div class="cal-corner"></div>
    ${EVENT_DAYS.map((d) => { const p = dayParts(d); return html`<div class="cal-dh" role="columnheader"><b>${p.wd}</b><span>${p.long}</span>${dayExtra(d)}</div>`; })}
    ${HOURS.map((h) => html`<div class="cal-hl ${dimHour(h) ? 'dim' : ''}" role="rowheader">${interactive ? html`<button type="button" class="cal-hbtn" data-act="cal-row" data-h="${h}" title="${t('cal.row_hint')}">${hourLabel(h)}</button>` : hourLabel(h)}</div>
      ${EVENT_DAYS.map((d) => { const c = cell(d, h) || {};
        return html`<button type="button" class="cal-cell ${c.cls || ''} ${dimHour(h) ? 'dim' : ''}" role="gridcell" data-d="${d}" data-h="${h}" style="${c.style || ''}" title="${c.title || ''}" ${interactive ? '' : raw('tabindex="-1"')}>${c.text ?? ''}</button>`; })}`)}
  </div></div>`;
}

// Drag-to-paint with the mouse; taps and the keyboard toggle a single cell. onStart(day, hour) returns the mode
// ('paint' | 'erase') or null to ignore; onApply(day, hour, mode) is called for every cell touched; onEnd() once at the end.
export function bindPaint(root, { onStart, onApply, onEnd }) {
  let mode = null, dragging = false, last = null, suppressClick = false;
  const at = (el) => { const c = el?.closest?.('.cal-cell'); return c && root.contains(c) ? c : null; };
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const c = at(e.target); if (!c) return;
    e.preventDefault();
    mode = onStart(c.dataset.d, Number(c.dataset.h)); if (!mode) return;
    dragging = true; suppressClick = true; last = c; px = e.clientX; py = e.clientY; onApply(c.dataset.d, Number(c.dataset.h), mode);
  });
  let px = 0, py = 0;
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // fast drags skip cells between two pointer events, so walk the straight line from the last position
    const dx = e.clientX - px, dy = e.clientY - py, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
    for (let i = 1; i <= steps; i++) {
      const c = at(document.elementFromPoint(px + (dx * i) / steps, py + (dy * i) / steps));
      if (c && c !== last) { last = c; onApply(c.dataset.d, Number(c.dataset.h), mode); }
    }
    px = e.clientX; py = e.clientY;
  });
  const end = () => { if (dragging) { dragging = false; last = null; onEnd?.(); setTimeout(() => { suppressClick = false; }, 0); } }; // a click only follows when released on the same cell
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  root.addEventListener('click', (e) => {
    const c = at(e.target); if (!c) return;
    if (suppressClick) { suppressClick = false; return; }
    const m = onStart(c.dataset.d, Number(c.dataset.h)); if (!m) return;
    onApply(c.dataset.d, Number(c.dataset.h), m); onEnd?.();
  });
}

// Hours per (team, day) from a slot map {slotKey: team}; used for the minimum-workload check.
export function hoursByTeamDay(slots) {
  const out = {};
  for (const [k, team] of slots) { const d = k.split('|')[0]; ((out[team] ||= {})[d] ||= 0); out[team][d] += 1; }
  return out;
}

// The "Workload" table: for each team the person applies to, hours planned per day vs the team's minimum per day.
export function workloadHtml(teams, slots, cfg) {
  const by = hoursByTeamDay(slots);
  return html`<div class="table-wrap"><table class="cal-work"><thead><tr><th>${t('cal.team')}</th>${EVENT_DAYS.map((d) => html`<th>${dayParts(d).num}</th>`)}<th>${t('cal.total')}</th></tr></thead><tbody>
    ${teams.map((key) => { const min = cfg[key]?.min_hours; const row = by[key] || {}; let total = 0, ok = 0;
      const cells = EVENT_DAYS.map((d) => { const h = row[d] || 0; total += h; const good = !min || h >= min; if (good) ok += 1;
        return html`<td class="${min ? (good ? 'ok' : 'low') : ''}">${h || '·'}</td>`; });
      return html`<tr><td><span class="dot" style="background:${teamColor(key)}"></span> ${teamName(key)}${min ? html`<div class="small muted">${t('cal.min_per_day', { n: min })} · ${t('cal.days_ok', { ok, n: EVENT_DAYS.length })}</div>` : ''}</td>${cells}<td><b>${total}</b></td></tr>`; })}
  </tbody></table></div>`;
}

export const legendHtml = (teams, { eraser = false, active = null, interactive = false } = {}) => html`<div class="cal-legend">
  ${teams.map((key) => interactive
    ? html`<button type="button" class="cal-chip ${active === key ? 'on' : ''}" data-act="cal-brush" data-team="${key}" style="--c:${teamColor(key)}"><span class="dot"></span>${teamName(key)}</button>`
    : html`<span class="cal-chip static" style="--c:${teamColor(key)}"><span class="dot"></span>${teamName(key)}</span>`)}
  ${eraser ? html`<button type="button" class="cal-chip ${active === '__erase' ? 'on' : ''}" data-act="cal-brush" data-team="__erase" style="--c:#888"><span class="dot"></span>${t('cal.eraser')}</button>` : ''}</div>`;

// Heat colour for the manager's summary: 0 is the gap (shown red by CSS), then light-to-dark green.
export const heat = (n, max) => (n <= 0 ? '' : `background:rgba(46,125,87,${0.18 + 0.72 * Math.min(1, n / Math.max(1, max))});color:${n / Math.max(1, max) > 0.55 ? '#fff' : '#14301f'}`);

export { TEAMS };
