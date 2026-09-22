// Program manager portal.
import { t, getLang } from './i18n.js';
import { html, raw, esc, actions, forms, openModal, confirmDialog, toast, errText, setBusy, wordCount, localName, fmtDate, fmtDateTime, debounce, initials, safeUrl } from './lib.js';
import * as api from './api.js';
import { state } from './api.js';
import { UNIVERSITIES } from './catalog.js';
import { navigate } from './router.js';
import { formMsg, ambassadorBody, localUniversity } from './pages-public.js';
import { updateBadges } from './pages-common.js';

const L = () => getLang();
const fullName = (a) => `${a.first_name || ''} ${a.last_name || ''}`.trim();
const actName = (key) => localName(state.config.activities.find((a) => a.key === key)) || key;
const refreshBadges = async () => { await api.refreshCounts(); updateBadges(); };
const statusChip = (s) => html`<span class="chip ${({ qualified: 'ok', in_progress: 'info', started: 'neutral', profile_incomplete: 'pending' })[s] || 'neutral'}">${t(`status.${s}`)}</span>`;

const miniProgress = (p) => html`<div class="mini-progress">${['core', 'elective', 'soft'].map((c) => {
  const x = p.categories[c];
  return html`<div><span>${t(`cat_short.${c}`)}</span><div class="bar sm ${c}"><i style="width:${(x.earned / x.required) * 100}%"></i></div><span>${x.earned}/${x.required}</span></div>`; })}</div>`;

// ── Overview ────────────────────────────────────────────────────────────────
export async function overviewView() {
  const [o, claims] = await Promise.all([api.mgr.overview(), api.mgr.claims('pending')]);
  const stat = (n, label, href) => html`<a class="stat" href="${href}" data-link style="text-decoration:none;color:inherit"><b>${n}</b><span>${label}</span></a>`;
  return {
    html: html`<div class="main-head"><h1>${t('mgr.overview')}</h1></div>
    <div class="stat-grid">
      ${stat(o.ambassadors, t('mgr.stat_registered'), '/manager/ambassadors')}
      ${stat(o.profiles_complete, t('mgr.stat_profiles'), '/manager/ambassadors')}
      ${stat(o.pending_claims, t('mgr.stat_pending'), '/manager/claims')}
      ${stat(o.published, t('mgr.stat_published'), '/ambassadors')}
    </div>
    <div class="cols-2">
      <div class="card"><h3>${t('mgr.by_status')}</h3>
        ${['profile_incomplete', 'started', 'in_progress', 'qualified'].map((s) => html`<div class="row" style="justify-content:space-between;margin-bottom:.5rem">${statusChip(s)}<b>${o.by_status[s] || 0}</b></div>`)}</div>
      <div class="card"><div class="row"><h3 style="margin:0">${t('mgr.pending_claims')}</h3><div class="grow"></div><a class="btn ghost sm" href="/manager/claims" data-link>${t('mgr.see_all')} →</a></div>
        ${claims.length ? claims.slice(0, 6).map((c) => html`<div class="row" style="justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--line)"><div><b>${fullName(c) || c.email}</b><div class="small muted">${actName(c.activity_key)}</div></div><span class="small muted">${fmtDate(c.created_at)}</span></div>`)
          : html`<p class="muted">${t('mgr.no_pending')}</p>`}</div>
    </div>`,
  };
}

// ── Ambassadors ─────────────────────────────────────────────────────────────
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function mgrAmbassadorsView() {
  const list = await api.mgr.ambassadors();
  const unis = [...new Set(list.map((a) => a.university).filter(Boolean))].sort();
  const rows = (items) => (items.length ? html`${items.map((a) => html`<tr>
      <td><b>${fullName(a) || '—'}</b><div class="small muted">${a.email}</div></td>
      <td class="small">${a.university ? localUniversity(a.university) : '—'}<div class="muted">${a.faculty || ''}</div></td>
      <td>${miniProgress(a.progress)}</td>
      <td><b>${a.progress.total}</b>/${a.progress.required}</td>
      <td>${statusChip(a.status)}</td>
      <td class="small muted">${a.last_seen_at ? fmtDate(a.last_seen_at) : t('mgr.never')}</td>
      <td><div class="row" style="flex-wrap:nowrap;gap:.3rem"><button class="btn secondary sm" type="button" data-act="amb-view" data-id="${a.id}">${t('mgr.view')}</button>
        <button class="btn ghost sm" type="button" data-act="amb-reset" data-id="${a.id}">${t('mgr.reset_pw')}</button>
        <button class="btn ghost sm" type="button" data-act="amb-msg" data-id="${a.id}">${t('mgr.message')}</button></div></td></tr>`)}`
    : html`<tr><td colspan="7" class="center muted" style="padding:2rem">${t('mgr.none')}</td></tr>`);
  return {
    html: html`<div class="main-head"><h1>${t('mgr.ambassadors')}</h1><div class="grow"></div><button class="btn secondary" type="button" data-act="amb-csv">⬇ ${t('mgr.export')}</button></div>
    <div class="toolbar"><input type="search" id="a-q" placeholder="${t('amb.search')}" aria-label="${t('amb.search')}">
      <select id="a-status" aria-label="${t('mgr.status')}"><option value="">${t('mgr.all_statuses')}</option>${['profile_incomplete', 'started', 'in_progress', 'qualified'].map((s) => html`<option value="${s}">${t(`status.${s}`)}</option>`)}</select>
      <select id="a-uni" aria-label="${t('profile.university')}"><option value="">${t('amb.all_universities')}</option>${unis.map((u) => html`<option value="${u}">${localUniversity(u)}</option>`)}</select>
      <span class="muted small" id="a-count"></span></div>
    <div class="table-wrap"><table><thead><tr><th>${t('mgr.ambassador')}</th><th>${t('profile.university')}</th><th>${t('mgr.progress')}</th><th>${t('mgr.total')}</th><th>${t('mgr.status')}</th><th>${t('mgr.last_active')}</th><th></th></tr></thead>
      <tbody id="a-rows">${rows(list)}</tbody></table></div>`,
    mount(root) {
      const q = root.querySelector('#a-q'), st = root.querySelector('#a-status'), un = root.querySelector('#a-uni');
      let shown = list;
      const apply = () => {
        const s = q.value.toLowerCase().trim();
        shown = list.filter((a) => (!st.value || a.status === st.value) && (!un.value || a.university === un.value)
          && (!s || `${fullName(a)} ${a.email} ${a.faculty || ''} ${a.university || ''}`.toLowerCase().includes(s)));
        root.querySelector('#a-rows').innerHTML = rows(shown).s;
        root.querySelector('#a-count').textContent = t('amb.count', { n: shown.length });
      };
      q.addEventListener('input', debounce(apply, 150)); st.addEventListener('change', apply); un.addEventListener('change', apply); apply();
      const byId = (id) => list.find((a) => a.id === id);
      actions['amb-csv'] = () => {
        const head = ['email', 'first_name', 'last_name', 'university', 'faculty', 'core', 'elective', 'soft', 'total', 'status', 'registered', 'last_active'];
        const body = shown.map((a) => [a.email, a.first_name, a.last_name, a.university, a.faculty, a.progress.categories.core.earned, a.progress.categories.elective.earned,
          a.progress.categories.soft.earned, a.progress.total, a.status, a.created_at, a.last_seen_at].map(csvCell).join(','));
        const blob = new Blob(['﻿' + [head.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = `ambassadors-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
      };
      actions['amb-msg'] = (el) => { const a = byId(el.dataset.id); sessionStorage.setItem('msgTo', JSON.stringify([{ id: a.id, name: fullName(a) || a.email }])); navigate('/manager/messages'); };
      actions['amb-reset'] = (el) => resetDialog(byId(el.dataset.id));
      actions['amb-view'] = async (el) => {
        const a = byId(el.dataset.id);
        const m = openModal({ title: fullName(a) || a.email, wide: true, body: html`<div class="loading"><span class="spinner"></span></div>` });
        try {
          const d = await api.mgr.ambassador(a.id);
          const prof = d.profile;
          m.el.querySelector('.modal-body').innerHTML = html`
            <dl class="kv" style="margin-bottom:1rem"><dt>${t('auth.email')}</dt><dd>${a.email}</dd><dt>${t('mgr.registered')}</dt><dd>${fmtDateTime(d.account.created_at)}</dd>
              <dt>${t('mgr.status')}</dt><dd>${statusChip(a.status)}</dd><dt>${t('mgr.total')}</dt><dd><b>${d.progress.total}</b> / ${d.progress.required}</dd></dl>
            ${miniProgress(d.progress)}
            <h4 style="margin-top:1.4rem">${t('nav.profile')}</h4>
            ${prof && prof.completed ? ambassadorBody(prof) : html`<p class="muted">${t('mgr.profile_incomplete')}</p>`}
            <h4 style="margin-top:1.4rem">${t('mgr.claims')}</h4>
            ${d.claims.length ? html`<div class="table-wrap"><table><thead><tr><th>${t('mgr.activity')}</th><th>${t('mgr.credits')}</th><th>${t('mgr.status')}</th><th>${t('mgr.submitted')}</th></tr></thead><tbody>
              ${d.claims.map((c) => html`<tr><td>${actName(c.activity_key)}</td><td>${c.credits}</td><td><span class="chip ${c.status}">${t(`learn.${c.status}`)}</span></td><td class="small">${fmtDate(c.created_at)}</td></tr>`)}</tbody></table></div>`
              : html`<p class="muted">${t('mgr.none')}</p>`}`.s;
        } catch (e) { m.el.querySelector('.modal-body').textContent = errText(e); }
      };
    },
  };
}

function resetDialog(a) {
  const m = openModal({
    title: `${t('mgr.reset_pw')} — ${fullName(a) || a.email}`,
    body: html`<p class="muted small">${t('mgr.reset_intro')}</p>
      <form data-form="mgr-reset" novalidate>
        <label class="check field"><input type="radio" name="mode" value="generate" checked> <span>${t('mgr.reset_generate')}</span></label>
        <label class="check field"><input type="radio" name="mode" value="manual"> <span>${t('mgr.reset_manual')}</span></label>
        <div class="field hidden" id="manual-pw"><input type="text" name="password" minlength="8" autocomplete="off" placeholder="${t('auth.new_password')}"></div>
        <div class="modal-foot"><button class="btn secondary" type="button" data-act="reset-link">${t('mgr.reset_send_link')}</button>
          <button class="btn" type="submit">${t('mgr.reset_pw')}</button></div></form><div id="reset-result"></div>`,
  });
  m.el.querySelectorAll('[name=mode]').forEach((r) => r.addEventListener('change', () => {
    m.el.querySelector('#manual-pw').classList.toggle('hidden', m.el.querySelector('[name=mode]:checked').value !== 'manual');
  }));
  actions['reset-link'] = async (el) => {
    setBusy(el, true, t('common.wait'));
    try { await api.sendReset(a.email); toast(t('mgr.reset_link_sent')); } catch (e) { toast(errText(e), 'bad'); }
    setBusy(el, false);
  };
  forms['mgr-reset'] = async (form) => {
    const btn = form.querySelector('[type=submit]');
    const manual = form.elements.mode.value === 'manual';
    const pw = form.elements.password.value.trim();
    if (manual && pw.length < 8) return formMsg(form, t('err.weak_password'));
    setBusy(btn, true, t('common.wait'));
    try {
      const r = await api.mgr.resetPassword(a.id, manual ? pw : undefined);
      form.hidden = true;
      m.el.querySelector('#reset-result').innerHTML = html`<div class="form-ok"><b>${t('mgr.reset_done')}</b>
        ${r.password ? html`<p style="margin:.6rem 0 0">${t('mgr.temp_password')}:</p><p><code id="tmp-pw" style="font-size:1.2rem;user-select:all">${r.password}</code>
          <button class="btn ghost sm" type="button" data-act="copy-pw">${t('common.copy')}</button></p><p class="small">${t('mgr.temp_password_note')}</p>` : ''}</div>`.s;
      actions['copy-pw'] = () => { navigator.clipboard?.writeText(r.password); toast(t('common.copied')); };
    } catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
  };
}

// ── Claims ──────────────────────────────────────────────────────────────────
const scanChip = (c) => {
  if (!c.scan) return '';
  const v = c.scan.verdict;
  const cls = { valid: 'ok', review: 'pending', invalid: 'bad', unreadable: 'neutral', scanning: 'info' }[v] || 'neutral';
  return html`<span class="chip ${cls}">${t(`scan.${v}`)}</span>`;
};
const checkinChip = (c) => {
  const k = c.checkin; if (!k) return '';
  if (!k.dataset_loaded) return html`<span class="chip neutral">${t('checkin.no_data')}</span>`;
  if (k.verified && k.matched_by === 'email') return html`<span class="chip ok">✓ ${t('checkin.verified')}</span>`;
  if (k.verified) return html`<span class="chip pending">${t('checkin.name_only')}</span>`;
  return html`<span class="chip bad">${t('checkin.not_found')}</span>`;
};

export async function claimsView() {
  let all = await api.mgr.claims(null);
  const ui = { status: 'pending', activity: '', q: '' };
  const filtered = () => all.filter((c) => (ui.status === 'all' || c.status === ui.status) && (!ui.activity || c.activity_key === ui.activity)
    && (!ui.q || `${fullName(c)} ${c.email} ${c.university || ''}`.toLowerCase().includes(ui.q)));
  const table = () => {
    const items = filtered();
    return items.length ? html`<div class="table-wrap"><table><thead><tr><th>${t('mgr.submitted')}</th><th>${t('mgr.ambassador')}</th><th>${t('mgr.activity')}</th><th>${t('mgr.credits')}</th><th>${t('mgr.auto_check')}</th><th>${t('mgr.status')}</th><th></th></tr></thead><tbody>
      ${items.map((c) => html`<tr><td class="small">${fmtDate(c.created_at)}</td><td><b>${fullName(c) || '—'}</b><div class="small muted">${c.email}</div></td>
        <td class="small">${actName(c.activity_key)}<div class="muted">${t(`cat.${c.category}`)}</div></td><td>${c.status === 'rejected' ? '—' : c.credits}</td>
        <td><div class="chips">${scanChip(c)}${checkinChip(c)}${c.duplicate_files ? html`<span class="chip bad">${t('scan.duplicate')}</span>` : ''}${c.auto ? html`<span class="chip info">${t('mgr.auto')}</span>` : ''}</div></td>
        <td><span class="chip ${c.status}">${t(`learn.${c.status}`)}</span></td>
        <td><button class="btn ${c.status === 'pending' ? '' : 'secondary'} sm" type="button" data-act="claim-review" data-id="${c.id}">${c.status === 'pending' ? t('mgr.review') : t('mgr.view')}</button></td></tr>`)}</tbody></table></div>`
      : html`<div class="empty">${t('mgr.no_claims')}</div>`;
  };
  const counts = (s) => (s === 'all' ? all.length : all.filter((c) => c.status === s).length);
  return {
    html: html`<div class="main-head"><h1>${t('mgr.claims')}</h1></div>
    <div class="toolbar"><div class="seg" id="c-seg">${['pending', 'approved', 'rejected', 'all'].map((s) => html`<button type="button" data-act="claim-filter" data-s="${s}" aria-pressed="${String(s === ui.status)}">${s === 'all' ? t('mgr.all') : t(`learn.${s}`)} (${counts(s)})</button>`)}</div>
      <select id="c-act" aria-label="${t('mgr.activity')}"><option value="">${t('mgr.all_activities')}</option>${state.config.activities.map((a) => html`<option value="${a.key}">${localName(a)}</option>`)}</select>
      <input type="search" id="c-q" placeholder="${t('amb.search')}" aria-label="${t('amb.search')}"></div>
    <div id="c-table">${table()}</div>`,
    mount(root) {
      const redraw = () => { root.querySelector('#c-table').innerHTML = table().s; root.querySelectorAll('#c-seg button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.s === ui.status)); b.textContent = `${b.dataset.s === 'all' ? t('mgr.all') : t(`learn.${b.dataset.s}`)} (${counts(b.dataset.s)})`; }); };
      actions['claim-filter'] = (el) => { ui.status = el.dataset.s; redraw(); };
      root.querySelector('#c-act').addEventListener('change', (e) => { ui.activity = e.target.value; redraw(); });
      root.querySelector('#c-q').addEventListener('input', debounce((e) => { ui.q = e.target.value.toLowerCase().trim(); redraw(); }, 150));
      actions['claim-review'] = (el) => reviewDialog(all.find((c) => String(c.id) === el.dataset.id), async () => { all = await api.mgr.claims(null); redraw(); refreshBadges(); });
    },
  };
}

function reviewDialog(c, onDone) {
  const f = c.form || {};
  const scan = c.scan;
  const m = openModal({
    title: `${actName(c.activity_key)}`, wide: true,
    body: html`<div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><b>${fullName(c) || '—'}</b> · <span class="muted">${c.email}</span><div class="small muted">${c.university ? localUniversity(c.university) : ''}</div></div>
        <div class="chips"><span class="chip credits">${c.default_credits} ${t('learn.credits')}</span><span class="chip ${c.status}">${t(`learn.${c.status}`)}</span><span class="chip neutral">${fmtDateTime(c.created_at)}</span></div></div>
      ${c.manager_comment ? html`<p class="small muted" style="margin-top:.6rem">${t('learn.manager_note')}: ${c.manager_comment}</p>` : ''}

      ${c.kind === 'checkin' ? html`<h4 style="margin-top:1.2rem">${t('mgr.submitted_details')}</h4>
        <dl class="kv"><dt>${t('claim.full_name')}</dt><dd>${f.full_name}</dd><dt>${t('auth.email')}</dt><dd>${f.email}</dd><dt>${t('profile.university')}</dt><dd>${f.university}</dd><dt>${t('claim.checkin_tick_short')}</dt><dd>${f.checkin_confirmed ? '✓' : '—'}</dd></dl>
        <h4 style="margin-top:1.2rem">${t('checkin.title')}</h4>${checkinPanel(c.checkin)}` : ''}

      ${c.kind === 'form' ? html`<h4 style="margin-top:1.2rem">${t('mgr.submitted_details')}</h4>
        <dl class="kv"><dt>${t('claim.project_name')}</dt><dd>${f.project_name}</dd><dt>${t('claim.dates')}</dt><dd>${f.date_from} → ${f.date_to}</dd>
          <dt>${t('claim.description')}</dt><dd style="white-space:pre-line">${f.description}</dd></dl>` : ''}

      ${c.kind === 'certificate' ? html`<h4 style="margin-top:1.2rem">${t('scan.title')}</h4><div id="scan-panel">${scanPanel(scan, c)}</div>` : ''}

      ${c.files.length ? html`<h4 style="margin-top:1.2rem">${t('mgr.files')}</h4><div id="files-panel"><div class="loading" style="min-height:80px"><span class="spinner"></span></div></div>` : ''}

      <form data-form="claim-decide" novalidate style="margin-top:1.4rem;border-top:1px solid var(--line);padding-top:1rem">
        ${c.is_other ? html`<div class="field" style="max-width:260px"><label for="d-credits">${t('mgr.award_credits')} (1–${c.default_credits})</label><input id="d-credits" name="credits" type="number" min="1" max="${c.default_credits}" value="${c.status === 'approved' ? c.credits : c.default_credits}"></div>` : ''}
        <div class="field"><label for="d-comment">${t('mgr.comment')}</label><textarea id="d-comment" name="comment" maxlength="1000" style="min-height:80px" placeholder="${t('mgr.comment_hint')}"></textarea></div>
        <div class="modal-foot" style="padding-top:0"><button class="btn secondary" type="button" data-modal-close>${t('common.close')}</button>
          <button class="btn danger" type="submit" data-decision="rejected" ${c.status === 'rejected' ? raw('disabled') : ''}>${t('mgr.reject')}</button>
          <button class="btn" type="submit" data-decision="approved" ${c.status === 'approved' ? raw('disabled') : ''}>${t('mgr.approve')}</button></div></form>`,
  });

  if (c.files.length) {
    Promise.all(c.files.map(async (file) => ({ file, url: await api.mgr.signedUrl(file.path).catch(() => null) }))).then((items) => {
      const panel = m.el.querySelector('#files-panel'); if (!panel) return;
      panel.innerHTML = items.map(({ file, url }) => html`<div class="card flat preview" style="margin-bottom:.8rem"><div class="row"><b class="small">${file.original_name}</b><div class="grow"></div>
        ${url ? html`<a class="btn secondary sm" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${t('mgr.open_file')} ↗</a>` : html`<span class="chip bad">${t('err.generic')}</span>`}</div>
        ${url && /^image\//.test(file.mime || '') ? html`<img src="${safeUrl(url)}" alt="${file.original_name}" style="margin-top:.6rem">` : ''}
        ${url && file.mime === 'application/pdf' ? html`<iframe src="${safeUrl(url)}" title="${file.original_name}" style="margin-top:.6rem"></iframe>` : ''}</div>`).map((x) => x.s).join('');
    });
  }
  if (c.kind === 'certificate' && c.scan?.verdict === 'scanning' && Date.now() - new Date(c.created_at) > 90 * 1000) {
    queueMicrotask(() => m.el.querySelector('[data-act=rescan]')?.click()); // a scan that never finished: run it again
  }
  actions['rescan'] = async (el) => {
    setBusy(el, true, t('scan.scanning'));
    try {
      const r = await api.mgr.rescan(c.id);
      if (r.error) throw r.error;
      c.scan = r.data?.scan || c.scan;
      m.el.querySelector('#scan-panel').innerHTML = scanPanel(c.scan, c).s;
    } catch (e) { toast(errText(e), 'bad'); setBusy(el, false); }
  };
  forms['claim-decide'] = async (form, e) => {
    const decision = e.submitter?.dataset.decision; if (!decision) return;
    if (decision === 'rejected' && !form.elements.comment.value.trim()) {
      if (!(await confirmDialog({ title: t('mgr.reject'), message: t('mgr.reject_no_comment'), danger: true }))) return;
    }
    const btns = form.querySelectorAll('[type=submit]'); btns.forEach((b) => { b.disabled = true; });
    try {
      const credits = form.elements.credits ? Number(form.elements.credits.value) : null;
      const r = await api.mgr.decide(c.id, decision, credits, form.elements.comment.value);
      toast(decision === 'approved' ? t('mgr.approved_ok', { n: r.credits }) : t('mgr.rejected_ok'));
      m.close(); onDone();
    } catch (err) { formMsg(form, errText(err)); btns.forEach((b) => { b.disabled = false; }); }
  };
}

function scanPanel(scan, c) {
  if (!scan) return html`<p class="muted">—</p>`;
  const yn = (b) => (b ? html`<span class="chip ok">✓</span>` : html`<span class="chip bad">✕</span>`);
  return html`<div class="card flat"><div class="row">${scanChip({ scan })}${c.duplicate_files ? html`<span class="chip bad">${t('scan.duplicate_long')}</span>` : ''}<div class="grow"></div>
      <button class="btn secondary sm" type="button" data-act="rescan">${t('scan.rescan')}</button></div>
    ${scan.verdict !== 'scanning' && scan.verdict !== 'unreadable' ? html`<dl class="kv" style="margin-top:.8rem"><dt>${t('scan.name_found')}</dt><dd>${yn(scan.nameMatch || scan.emailMatch)}</dd>
      <dt>${t('scan.course_found')}</dt><dd>${yn(scan.courseMatch)} ${(scan.keywords || []).map((k) => html`<span class="chip neutral">${k}</span> `)}</dd></dl>` : ''}
    <p class="small muted" style="margin:.6rem 0 0">${scan.verdict === 'unreadable' ? t('scan.unreadable_note') : t('scan.advisory')}${scan.note ? ` (${scan.note})` : ''}</p></div>`;
}

function checkinPanel(k) {
  if (!k?.dataset_loaded) return html`<div class="banner"><span>ℹ️</span><div>${t('checkin.no_data_long')}</div></div>`;
  if (!k.verified) return html`<div class="banner bad"><span>✕</span><div>${t('checkin.not_found_long')}</div></div>`;
  return html`<div class="banner ${k.matched_by === 'email' ? 'ok' : ''}"><span>${k.matched_by === 'email' ? '✓' : '⚠️'}</span><div>${k.matched_by === 'email' ? t('checkin.verified_long') : t('checkin.name_only_long')}</div></div>
    ${k.rows.map((r) => html`<div class="table-wrap" style="margin-bottom:.6rem"><table><tbody>${Object.entries(r.data).slice(0, 12).map(([key, v]) => html`<tr><th style="width:200px">${key}</th><td>${v}</td></tr>`)}</tbody></table></div>`)}`;
}

// ── Check-in datasets ───────────────────────────────────────────────────────
const EMAIL_RE = /[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+/;
const NAME_HEADER_RE = /name|surname|անուն|ազգանուն|имя|фамилия/i;

// Column headers are classified by tokenizing on non-letter characters (so bilingual headers like
// "Անուն / First Name" split cleanly) and checking whole tokens rather than substrings — a plain
// substring match would wrongly treat "Հայրանուն" (father's/patronymic name) as a "name" column, since
// it contains "անուն" ("name") inside it. Patronymics are excluded: ambassador profiles only store a
// first and last name, so mixing in a middle/patronymic name would break matching.
const FATHER_TOKENS = new Set(['father', 'patronymic', 'հայրանուն', 'отчество', 'միջին']);
const FIRST_TOKENS = new Set(['first', 'given', 'անուն']);
const LAST_TOKENS = new Set(['last', 'surname', 'family', 'ազգանուն', 'фамилия']);
const headerTokens = (h) => h.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
function classifyHeader(h) {
  const tokens = headerTokens(h);
  if (tokens.some((t) => FATHER_TOKENS.has(t))) return 'father';
  if (tokens.some((t) => FIRST_TOKENS.has(t))) return 'first';
  if (tokens.some((t) => LAST_TOKENS.has(t))) return 'last';
  if (tokens.includes('name') || tokens.includes('имя')) return 'name';
  return null;
}
function extractName(cells) {
  const classified = cells.map(([k, v]) => [v, classifyHeader(k)]);
  const first = classified.find(([v, c]) => c === 'first' && v)?.[0];
  const last = classified.find(([v, c]) => c === 'last' && v)?.[0];
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return classified.filter(([v, c]) => c === 'name' && v).map(([v]) => v).join(' '); // fallback: a single combined "Name" column
}

async function parseAttendance(file) {
  if (!window.XLSX) throw new Error('parse_unavailable');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const records = [];
  for (const name of wb.SheetNames) {
    for (const row of window.XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false })) {
      const cells = Object.entries(row).map(([k, v]) => [String(k), String(v).trim()]).filter(([, v]) => v);
      if (!cells.length) continue;
      let email = '';
      for (const [, v] of cells) { const m = v.match(EMAIL_RE); if (m) { email = m[0]; break; } }
      const nm = extractName(cells);
      if (!email && !nm) continue;
      records.push({ name: nm, email, raw: Object.fromEntries(cells) });
    }
  }
  return records;
}

export async function checkinsView() {
  const [batches, records] = await Promise.all([api.mgr.batches(), api.mgr.records(300)]);
  const recRows = (items) => items.map((r) => html`<tr><td>${r.name || '—'}</td><td>${r.email || '—'}</td><td class="small muted">${Object.entries(r.raw).filter(([k]) => !NAME_HEADER_RE.test(k) && !/mail/i.test(k)).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}</td></tr>`);
  return {
    html: html`<div class="main-head"><h1>${t('mgr.checkins')}</h1></div>
    <p class="muted" style="max-width:760px">${t('checkin.intro')}</p>
    <div class="card" style="margin-bottom:1.5rem"><h3>${t('checkin.upload')}</h3>
      <div class="row"><input type="file" id="ck-file" accept=".xlsx,.xls,.csv" style="max-width:420px"><button class="btn" type="button" data-act="ck-parse">${t('checkin.read_file')}</button></div>
      <div id="ck-preview" style="margin-top:1rem"></div></div>
    <h3>${t('checkin.datasets')}</h3>
    ${batches.length ? html`<div class="table-wrap" style="margin-bottom:1.5rem"><table><thead><tr><th>${t('checkin.file')}</th><th>${t('checkin.rows')}</th><th>${t('checkin.uploaded')}</th><th></th></tr></thead><tbody>
      ${batches.map((b) => html`<tr><td>${b.filename}</td><td>${b.rows}</td><td class="small">${fmtDateTime(b.uploaded_at)}</td><td><button class="btn ghost sm" type="button" data-act="ck-delete" data-id="${b.id}">${t('common.delete')}</button></td></tr>`)}</tbody></table></div>`
      : html`<div class="empty" style="margin-bottom:1.5rem">${t('checkin.none')}</div>`}
    ${records.length ? html`<h3>${t('checkin.records')}</h3><div class="toolbar"><input type="search" id="ck-q" placeholder="${t('amb.search')}"></div>
      <div class="table-wrap"><table><thead><tr><th>${t('claim.full_name')}</th><th>${t('auth.email')}</th><th></th></tr></thead><tbody id="ck-rows">${recRows(records)}</tbody></table></div>` : ''}`,
    mount(root) {
      let parsed = null, filename = '';
      actions['ck-parse'] = async (el) => {
        const file = root.querySelector('#ck-file').files[0]; const out = root.querySelector('#ck-preview');
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) { out.innerHTML = html`<div class="form-error">${t('err.invalid_file')}</div>`.s; return; }
        setBusy(el, true, t('common.wait'));
        try {
          parsed = await parseAttendance(file); filename = file.name;
          out.innerHTML = parsed.length ? html`<div class="form-ok">${t('checkin.found', { n: parsed.length, e: parsed.filter((r) => r.email).length })}</div>
            <div class="table-wrap" style="margin-bottom:1rem"><table><tbody>${recRows(parsed.slice(0, 5))}</tbody></table></div><button class="btn" type="button" data-act="ck-import">${t('checkin.import')}</button>`.s
            : html`<div class="form-error">${t('checkin.empty_file')}</div>`.s;
        } catch (e) { out.innerHTML = html`<div class="form-error">${errText(e)}</div>`.s; }
        setBusy(el, false);
      };
      actions['ck-import'] = async (el) => {
        setBusy(el, true, t('common.uploading'));
        try { await api.mgr.importCheckins(filename, parsed); toast(t('checkin.imported', { n: parsed.length })); navigate(location.pathname); }
        catch (e) { toast(errText(e), 'bad'); setBusy(el, false); }
      };
      actions['ck-delete'] = async (el) => {
        if (!(await confirmDialog({ title: t('common.delete'), message: t('checkin.delete_confirm'), danger: true, confirmText: t('common.delete') }))) return;
        try { await api.mgr.deleteBatch(el.dataset.id); navigate(location.pathname); } catch (e) { toast(errText(e), 'bad'); }
      };
      root.querySelector('#ck-q')?.addEventListener('input', debounce((e) => {
        const s = e.target.value.toLowerCase().trim();
        root.querySelector('#ck-rows').innerHTML = recRows(records.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(s))).map((x) => x.s).join('');
      }, 150));
    },
  };
}

// ── Messages (announcements) ────────────────────────────────────────────────
const audienceLabel = (a) => {
  if (a.mode === 'all') return t('msg.aud_all');
  if (a.mode === 'university') return `${t('profile.university')}: ${localUniversity(a.university)}`;
  if (a.mode === 'status') return `${t('mgr.status')}: ${t(`status.${a.status}`)}`;
  return t('msg.aud_selected_n', { n: (a.ids || []).length });
};

export async function messagesView() {
  const [ambassadors, history] = await Promise.all([api.mgr.ambassadors(), api.mgr.announcements()]);
  let preset = [];
  try { preset = JSON.parse(sessionStorage.getItem('msgTo') || '[]'); sessionStorage.removeItem('msgTo'); } catch { /* ignore */ }
  const unis = [...new Set(ambassadors.map((a) => a.university).filter(Boolean))].sort();
  return {
    html: html`<div class="main-head"><h1>${t('mgr.messages')}</h1></div>
    <form data-form="announce" class="card" novalidate>
      <h3>${t('msg.compose')}</h3><p class="muted small">${t('msg.intro')}</p>
      <div class="field" style="max-width:420px"><label for="m-mode">${t('msg.audience')}</label>
        <select id="m-mode" name="mode"><option value="all">${t('msg.aud_all')}</option><option value="university">${t('msg.aud_university')}</option><option value="status">${t('msg.aud_status')}</option><option value="selected" ${preset.length ? raw('selected') : ''}>${t('msg.aud_selected')}</option></select></div>
      <div class="field hidden" data-aud="university" style="max-width:420px"><select name="university" aria-label="${t('profile.university')}">${unis.map((u) => html`<option value="${u}">${localUniversity(u)}</option>`)}</select></div>
      <div class="field hidden" data-aud="status" style="max-width:420px"><select name="status" aria-label="${t('mgr.status')}">${['profile_incomplete', 'started', 'in_progress', 'qualified'].map((s) => html`<option value="${s}">${t(`status.${s}`)}</option>`)}</select></div>
      <div class="field hidden" data-aud="selected"><input type="search" id="m-find" placeholder="${t('amb.search')}" style="max-width:420px;margin-bottom:.5rem">
        <div class="card flat" style="max-height:220px;overflow:auto;padding:.6rem 1rem" id="m-list">${ambassadors.map((a) => html`<label class="check" style="font-weight:400;margin:.25rem 0" data-search="${`${fullName(a)} ${a.email}`.toLowerCase()}">
          <input type="checkbox" name="ids" value="${a.id}" ${preset.some((p) => p.id === a.id) ? raw('checked') : ''}> <span>${fullName(a) || a.email} <span class="muted small">${fullName(a) ? a.email : ''}</span></span></label>`)}</div></div>
      <p class="chip info" id="m-count" style="margin-bottom:1rem"></p>
      <div class="grid-2"><div class="field"><label for="m-ten">${t('msg.title_en')}</label><input id="m-ten" name="title_en" type="text" maxlength="200"></div>
        <div class="field"><label for="m-thy">${t('msg.title_hy')}</label><input id="m-thy" name="title_hy" type="text" maxlength="200"></div>
        <div class="field"><label for="m-ben">${t('msg.body_en')}</label><textarea id="m-ben" name="body_en" maxlength="4000"></textarea></div>
        <div class="field"><label for="m-bhy">${t('msg.body_hy')}</label><textarea id="m-bhy" name="body_hy" maxlength="4000"></textarea></div></div>
      <button class="btn" type="submit">📣 ${t('msg.send')}</button></form>
    <h3 style="margin-top:2rem">${t('msg.history')}</h3>
    ${history.length ? html`<div class="table-wrap"><table><thead><tr><th>${t('mgr.submitted')}</th><th>${t('msg.subject')}</th><th>${t('msg.audience')}</th><th>${t('msg.recipients')}</th></tr></thead><tbody>
      ${history.map((h) => html`<tr><td class="small">${fmtDateTime(h.created_at)}</td><td><b>${(L() === 'hy' ? h.title_hy || h.title_en : h.title_en || h.title_hy)}</b><div class="small muted" style="white-space:pre-line">${(L() === 'hy' ? h.body_hy || h.body_en : h.body_en || h.body_hy)?.slice(0, 160)}</div></td><td class="small">${audienceLabel(h.audience)}</td><td>${h.recipients}</td></tr>`)}</tbody></table></div>`
      : html`<div class="empty">${t('msg.no_history')}</div>`}`,
    mount(root) {
      const form = root.querySelector('form');
      const audience = () => {
        const mode = form.elements.mode.value;
        if (mode === 'university') return { mode, university: form.elements.university.value };
        if (mode === 'status') return { mode, status: form.elements.status.value };
        if (mode === 'selected') return { mode, ids: [...form.querySelectorAll('[name=ids]:checked')].map((i) => i.value) };
        return { mode: 'all' };
      };
      forms.announce.audience = audience;
      const refreshCount = debounce(async () => {
        const el = root.querySelector('#m-count');
        try { el.textContent = t('msg.will_reach', { n: await api.mgr.audienceCount(audience()) }); } catch { el.textContent = ''; }
      }, 200);
      const sync = () => { form.querySelectorAll('[data-aud]').forEach((d) => d.classList.toggle('hidden', d.dataset.aud !== form.elements.mode.value)); refreshCount(); };
      form.addEventListener('change', sync); sync();
      root.querySelector('#m-find').addEventListener('input', debounce((e) => {
        const s = e.target.value.toLowerCase().trim();
        root.querySelectorAll('#m-list label').forEach((l) => { l.classList.toggle('hidden', !!s && !l.dataset.search.includes(s)); });
      }, 120));
    },
  };
}
forms.announce = async (form) => {
  const btn = form.querySelector('[type=submit]'); const v = (n) => form.elements[n].value.trim();
  if ((!v('title_en') && !v('title_hy')) || (!v('body_en') && !v('body_hy'))) return formMsg(form, t('msg.err_content'));
  const aud = forms.announce.audience();
  let n; try { n = await api.mgr.audienceCount(aud); } catch (e) { return formMsg(form, errText(e)); }
  if (!n) return formMsg(form, t('err.no_recipients'));
  if (!(await confirmDialog({ title: t('msg.send'), message: t('msg.confirm', { n }), confirmText: t('msg.send') }))) return;
  setBusy(btn, true, t('common.wait'));
  try {
    await api.mgr.announce({ title_en: v('title_en'), title_hy: v('title_hy'), body_en: v('body_en'), body_hy: v('body_hy'), audience: aud });
    toast(t('msg.sent', { n })); navigate(location.pathname);
  } catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
};

// ── Contact inbox ───────────────────────────────────────────────────────────
export async function inboxView() {
  const list = await api.mgr.contact();
  return {
    html: html`<div class="main-head"><h1>${t('mgr.inbox')}</h1></div>
    ${list.length ? list.map((m) => html`<article class="notif ${m.read_at ? '' : 'unread'}"><div class="ic" aria-hidden="true">✉️</div>
      <div><h4>${m.subject || t('contact.no_subject')}</h4><p>${m.message}</p>
        <div class="muted small" style="margin-top:.4rem">${m.name} · <a href="mailto:${m.email}">${m.email}</a> · ${fmtDateTime(m.created_at)}</div></div>
      <div class="row"><a class="btn secondary sm" href="mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || ''}`)}">${t('mgr.reply')}</a>
        ${m.read_at ? '' : html`<button class="btn ghost sm" type="button" data-act="inbox-read" data-id="${m.id}">${t('notif.mark_read')}</button>`}</div></article>`)
      : html`<div class="empty">${t('mgr.inbox_empty')}</div>`}`,
    mount() {
      actions['inbox-read'] = async (el) => { await api.mgr.contactRead(Number(el.dataset.id)); await refreshBadges(); navigate(location.pathname); };
    },
  };
}

// ── Account ─────────────────────────────────────────────────────────────────
export function mgrAccountView() {
  return {
    html: html`<div class="main-head"><h1>${t('mgr.account')}</h1></div>
    <form data-form="changepw" class="card" style="max-width:640px" novalidate>
      <p class="muted">${t('account.email')}: <b>${state.account?.email}</b></p>
      <div class="field"><label for="cp1">${t('auth.new_password')}</label><input id="cp1" name="password" type="password" autocomplete="new-password" minlength="8"></div>
      <div class="field"><label for="cp2">${t('auth.password2')}</label><input id="cp2" name="password2" type="password" autocomplete="new-password"></div>
      <button class="btn" type="submit">${t('account.change_password')}</button></form>`,
  };
}
