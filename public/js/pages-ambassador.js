// Ambassador platform: My Profile, My Learning (credit framework + claim flows), UNICEF modules.
import { t, getLang } from './i18n.js';
import { html, raw, esc, photoPos, actions, forms, openModal, confirmDialog, toast, errText, setBusy, wordCount, localName, fmtDate, fmtDateTime, safeUrl, resizeImage, initials, skillLabel, langLabel, profLabel } from './lib.js';
import * as api from './api.js';
import { state, isLocked } from './api.js';
import { SKILLS, LANGUAGES, PROFICIENCY, UNIVERSITIES } from './catalog.js';
import { navigate } from './router.js';
import { MEDIA_BASE } from './config.js';
import { CONTENT } from './content.js';
import { formMsg, localUniversity } from './pages-public.js';
import { askBlueZone } from './pages-common.js';
import { downloadLetter } from './letters.js';
import { TEAMS, TEAM_ORDER, EVENT_DAYS, HOURS, FIRST_HOUR, LAST_HOUR, dayParts, hourLabel, teamName, teamColor } from './teams.js';
import { calGrid, bindPaint, slotKey, workloadHtml, legendHtml } from './calendar.js';

const opt = (list, sel) => list.map((o) => html`<option value="${o.key}" ${o.key === sel ? raw('selected') : ''}>${o[getLang()]}</option>`);

// University: pick from the AUCB list or type another one.
function universityField(current, prefix = 'uni') {
  const known = UNIVERSITIES.some((u) => u.key === current);
  const other = current && !known;
  return html`<div class="field"><label for="${prefix}-sel">${t('profile.university')} *</label>
    <select id="${prefix}-sel" name="${prefix}_sel" data-on-change="uni-change" required>
      <option value="">${t('common.select')}</option>${opt(UNIVERSITIES, known ? current : '')}
      <option value="__other" ${other ? raw('selected') : ''}>${t('profile.other_university')}</option></select>
    <input type="text" name="${prefix}_other" maxlength="200" style="margin-top:.5rem" class="${other ? '' : 'hidden'}" value="${other ? current : ''}" placeholder="${t('profile.university_name')}"></div>`;
}
actions['uni-change'] = (el) => { const inp = el.closest('.field').querySelector('input[type=text]'); inp.classList.toggle('hidden', el.value !== '__other'); if (el.value === '__other') inp.focus(); };
const readUniversity = (form, prefix = 'uni') => {
  const v = form.elements[`${prefix}_sel`].value;
  return v === '__other' ? form.elements[`${prefix}_other`].value.trim() : v;
};

// ── My Profile ──────────────────────────────────────────────────────────────
let pendingPhoto = null;

const langRow = (l = {}) => {
  const known = LANGUAGES.some((x) => x.key === l.lang);
  const isOther = l.lang && !known;
  return html`<div class="lang-row" data-lang-row>
    <div><select name="lang" data-on-change="lang-change" aria-label="${t('profile.language')}"><option value="">${t('common.select')}</option>${opt(LANGUAGES, known ? l.lang : '')}
        <option value="__other" ${isOther ? raw('selected') : ''}>${t('profile.other_language')}</option></select>
      <input type="text" name="lang_name" maxlength="60" style="margin-top:.4rem" class="${isOther ? '' : 'hidden'}" value="${isOther ? (l.name || l.lang) : ''}" placeholder="${t('profile.language_name')}"></div>
    <select name="level" aria-label="${t('profile.proficiency')}"><option value="">${t('profile.proficiency')}</option>${opt(PROFICIENCY, l.level)}</select>
    <button class="btn ghost sm" type="button" data-act="lang-remove" aria-label="${t('common.remove')}">✕</button></div>`;
};

export async function profileView() {
  const p = state.profile || {};
  const social = p.social || {};
  const skills = new Set(p.skills || []);
  const customSkills = [...skills].filter((s) => !SKILLS.some((x) => x.key === s));
  const langs = p.languages?.length ? p.languages : [{}];
  pendingPhoto = null;
  const prog = state.progress;
  const published = false;
  const statusBanner = !p.completed
    ? html`<div class="banner"><span>👋</span><div><b>${t('profile.welcome')}</b><br>${t('profile.required_note')}</div></div>`
    : html`<div class="banner ok"><span>✅</span><div>${t('profile.public_note', { n: prog?.total ?? 0 })}</div></div>`;

  return {
    html: html`<div class="main-head"><h1>${t('nav.profile')}</h1></div>${statusBanner}
    <form data-form="profile" class="card" novalidate>
      <h3>${t('profile.about_you')}</h3>
      <div class="grid-2">
        <div class="field"><label for="p-first">${t('profile.first_name')} *</label><input id="p-first" name="first_name" type="text" maxlength="80" value="${p.first_name || ''}" required autocomplete="given-name"></div>
        <div class="field"><label for="p-last">${t('profile.last_name')} *</label><input id="p-last" name="last_name" type="text" maxlength="80" value="${p.last_name || ''}" required autocomplete="family-name"></div>
        ${universityField(p.university, 'uni')}
        <div class="field"><label for="p-fac">${t('profile.faculty')} *</label><input id="p-fac" name="faculty" type="text" maxlength="200" value="${p.faculty || ''}" required></div>
      </div>

      <div class="field"><label>${t('profile.photo')} *</label>
        <div class="photo-pick">
          <div class="avatar" id="photo-preview">${p.photo_path ? html`<img src="${api.photoUrl(p.photo_path)}" alt="" style="width:100%;height:100%;object-fit:cover;${photoPos(p)}">` : initials(p.first_name, p.last_name)}</div>
          <div><input type="file" id="p-photo" accept="image/jpeg,image/png,image/webp"><div class="hint">${t('profile.photo_hint')}</div></div></div></div>

      <div class="field"><label>${t('profile.skills')} * <span class="muted" style="font-weight:400">— ${t('profile.skills_hint')}</span></label>
        <div class="chips" id="skill-chips">${SKILLS.map((s) => html`<button type="button" class="toggle-chip" data-act="skill-toggle" data-key="${s.key}" aria-pressed="${String(skills.has(s.key))}">${s[getLang()]}</button>`)}
          ${customSkills.map((s) => html`<button type="button" class="toggle-chip" data-act="skill-toggle" data-key="${s}" aria-pressed="true">${skillLabel(s)}</button>`)}</div>
        <div class="row" style="margin-top:.6rem"><input type="text" id="skill-custom" maxlength="40" placeholder="${t('profile.skill_other')}" style="max-width:280px">
          <button class="btn secondary sm" type="button" data-act="skill-add">${t('common.add')}</button></div></div>

      <div class="field"><label>${t('profile.languages')} *</label><div id="lang-rows">${langs.map(langRow)}</div>
        <button class="btn secondary sm" type="button" data-act="lang-add">+ ${t('profile.add_language')}</button></div>

      <div class="field"><label for="p-bio">${t('profile.bio')} *</label>
        <textarea id="p-bio" name="bio" maxlength="1600" required>${p.bio || ''}</textarea>
        <div class="counter" id="bio-counter" aria-live="polite"></div></div>

      <h3 style="margin-top:1.6rem">${t('profile.optional')}</h3>
      <div class="grid-2">
        ${['linkedin', 'instagram', 'facebook', 'x', 'website'].map((k) => html`<div class="field"><label for="p-${k}">${t(`social.${k}`)}</label>
          <input id="p-${k}" name="social_${k}" type="url" maxlength="300" placeholder="https://" value="${social[k] || ''}"></div>`)}
        <div class="field"><label for="p-pemail">${t('profile.public_email')}</label><input id="p-pemail" name="public_email" type="email" maxlength="200" value="${p.public_email || ''}">
          <div class="hint">${t('profile.public_email_hint')}</div></div>
      </div>
      <div class="row" style="margin-top:1rem"><button class="btn" type="submit">${p.completed ? t('common.save') : t('profile.save_continue')}</button>
        <span class="muted small">${t('profile.required_legend')}</span></div>
    </form>

    <form data-form="changepw" class="card" style="margin-top:1.5rem" novalidate>
      <h3>${t('account.title')}</h3><p class="muted small">${t('account.email')}: <b>${state.account?.email}</b></p>
      <div class="grid-2"><div class="field"><label for="cp1">${t('auth.new_password')}</label><input id="cp1" name="password" type="password" autocomplete="new-password" minlength="8"></div>
        <div class="field"><label for="cp2">${t('auth.password2')}</label><input id="cp2" name="password2" type="password" autocomplete="new-password"></div></div>
      <button class="btn secondary" type="submit">${t('account.change_password')}</button></form>`,
    mount(root) {
      const bio = root.querySelector('#p-bio'), counter = root.querySelector('#bio-counter');
      const upd = () => { const n = wordCount(bio.value); counter.textContent = t('profile.words', { n, max: 150 }); counter.className = `counter ${n > 150 ? 'bad' : ''}`; };
      bio.addEventListener('input', upd); upd();
      root.querySelector('#p-photo').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 15 * 1024 * 1024) { toast(t('err.invalid_image'), 'bad'); e.target.value = ''; return; }
        try {
          pendingPhoto = await resizeImage(f);
          root.querySelector('#photo-preview').innerHTML = `<img src="${URL.createObjectURL(pendingPhoto)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
        } catch { toast(t('err.invalid_image'), 'bad'); }
      });
      actions['skill-toggle'] = (el) => el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'));
      actions['skill-add'] = () => {
        const inp = root.querySelector('#skill-custom'); const v = inp.value.trim(); if (!v) return;
        const key = `other:${v.slice(0, 40)}`;
        if (![...root.querySelectorAll('#skill-chips [data-key]')].some((b) => b.dataset.key === key)) {
          root.querySelector('#skill-chips').insertAdjacentHTML('beforeend', html`<button type="button" class="toggle-chip" data-act="skill-toggle" data-key="${key}" aria-pressed="true">${v}</button>`.s);
        }
        inp.value = '';
      };
      actions['lang-add'] = () => root.querySelector('#lang-rows').insertAdjacentHTML('beforeend', langRow().s);
      actions['lang-remove'] = (el) => { const rows = root.querySelectorAll('[data-lang-row]'); if (rows.length > 1) el.closest('[data-lang-row]').remove(); else { el.closest('[data-lang-row]').querySelectorAll('select').forEach((s) => { s.value = ''; }); } };
      actions['lang-change'] = (el) => { const inp = el.parentElement.querySelector('input'); inp.classList.toggle('hidden', el.value !== '__other'); if (el.value === '__other') inp.focus(); };
    },
  };
}

forms.profile = async (form) => {
  const btn = form.querySelector('[type=submit]');
  const v = (n) => form.elements[n]?.value.trim() || '';
  const skills = [...form.querySelectorAll('#skill-chips [aria-pressed=true]')].map((b) => b.dataset.key);
  const languages = [...form.querySelectorAll('[data-lang-row]')].map((r) => {
    const sel = r.querySelector('[name=lang]').value, level = r.querySelector('[name=level]').value;
    const name = r.querySelector('[name=lang_name]').value.trim();
    return sel === '__other' ? { lang: 'other', name, level } : { lang: sel, level };
  }).filter((l) => l.lang);
  const university = readUniversity(form);
  const social = {};
  for (const k of ['linkedin', 'instagram', 'facebook', 'x', 'website']) {
    let u = v(`social_${k}`);
    if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
    if (u) social[k] = u;
  }
  const bio = v('bio');
  const hasPhoto = !!(pendingPhoto || state.profile?.photo_path);
  if (!v('first_name') || !v('last_name') || !university || !v('faculty') || !skills.length || !languages.length || !bio) return formMsg(form, t('profile.err_required'));
  if (languages.some((l) => !l.level || (l.lang === 'other' && !l.name))) return formMsg(form, t('profile.err_language'));
  if (!hasPhoto) return formMsg(form, t('profile.err_photo'));
  if (wordCount(bio) > 150) return formMsg(form, t('profile.err_bio'));
  const wasComplete = !!state.profile?.completed;
  setBusy(btn, true, t('common.wait'));
  try {
    await api.saveProfile({ first_name: v('first_name'), last_name: v('last_name'), university, faculty: v('faculty'), skills, languages, bio, social, public_email: v('public_email') || null }, pendingPhoto);
    pendingPhoto = null;
    toast(t('profile.saved'));
    if (!wasComplete && state.profile?.completed) return navigate('/app/learning');
    navigate('/app/profile');
  } catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
};

forms.changepw = async (form) => {
  const btn = form.querySelector('[type=submit]');
  const { password, password2 } = Object.fromEntries(new FormData(form));
  if (!password || password.length < 8) return formMsg(form, t('err.weak_password'));
  if (password !== password2) return formMsg(form, t('err.password_mismatch'));
  setBusy(btn, true, t('common.wait'));
  try { await api.setPassword(password); form.reset(); formMsg(form, t('auth.password_changed'), 'ok'); }
  catch (e) { formMsg(form, errText(e)); }
  setBusy(btn, false);
};

// ── My Learning ─────────────────────────────────────────────────────────────
const chipFor = (c) => {
  if (c.status === 'approved') return html`<span class="chip approved">✓ ${t('learn.approved')} · +${c.credits}</span>`;
  if (c.status === 'pending') return html`<span class="chip pending">⏳ ${t('learn.pending')}</span>`;
  return html`<span class="chip rejected">✕ ${t('learn.rejected')}</span>`;
};

function activityRow(a, ctx) {
  const { claims, progress, locked, unicefDone, unicefTotal } = ctx;
  const cat = progress.categories[a.category];
  const mine = claims.filter((c) => c.activity_key === a.key);
  const active = mine.find((c) => c.status === 'pending' || c.status === 'approved');
  const rejected = mine.find((c) => c.status === 'rejected');
  let reason = '';
  if (locked) reason = t('learn.locked');
  else if (cat.complete) reason = t('learn.cat_closed');
  else if (cat.full) reason = t('learn.cat_full');
  const blocked = !!reason;

  let action;
  if (a.kind === 'portal') {
    action = active ? '' : html`<a class="btn ${blocked ? 'is-disabled' : ''}" href="/app/unicef" data-link ${blocked ? raw('aria-disabled="true" tabindex="-1"') : ''}>${unicefDone ? t('learn.continue') : t('learn.take')}</a>`;
  } else if (!a.is_other && active) {
    action = '';
  } else {
    const label = { checkin: t('learn.claim'), claim: t('learn.claim_credits') }[a.kind] || t('learn.upload_cert');
    const act = { checkin: 'claim-checkin', claim: 'claim-simple', certificate: 'claim-cert', form: 'claim-form' }[a.kind];
    action = html`<button class="btn ${a.kind === 'checkin' || a.kind === 'claim' ? '' : 'secondary'}" type="button" data-act="${act}" data-key="${a.key}" ${blocked ? raw('disabled') : ''}>${label}</button>`;
  }
  const status = !a.is_other && active ? chipFor(active) : (!a.is_other && rejected ? chipFor(rejected) : '');
  const notes = (a.is_other ? mine : [active || rejected].filter(Boolean)).filter((c) => c.manager_comment || (a.is_other));
  return html`<div class="activity">
    <div><h3>${a[getLang()]}</h3>
      <div class="meta"><span class="chip credits">${a.credits} ${t('learn.credits')}</span>
        ${a.url ? html`<a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer">${t('learn.course_link')} ↗</a>` : ''}
        ${a.kind === 'portal' ? html`<span class="muted">${t('learn.modules_done', { done: unicefDone, total: unicefTotal })}</span>` : ''}
        ${status}
        ${a.kind === 'certificate' && active?.scan?.verdict === 'scanning' && Date.now() - new Date(active.created_at) < 10 * 60 * 1000 ? html`<span class="muted">${t('learn.scanning')}</span>` : ''}</div></div>
    <div class="actions">${action}${blocked && action && !active ? html`<span class="muted small" style="align-self:center">${reason}</span>` : ''}</div>
    ${notes.length ? html`<div class="sub">${notes.map((c) => html`<div class="row" style="gap:.5rem;margin-bottom:.2rem">${a.is_other ? html`<b>${c.form?.project_name || ''}</b>` : ''}${a.is_other ? chipFor(c) : ''}
        ${c.manager_comment ? html`<span class="muted">${t('learn.manager_note')}: ${c.manager_comment}</span>` : ''}</div>`)}</div>` : ''}
  </div>`;
}

// The webinar is claimed by checking in and out while the manager has each window open (see webinar_check_in/out).
function webinarHtml(w, progress) {
  const a = state.config.activities.find((x) => x.key === 'webinar');
  const locked = isLocked();
  const wp = progress.categories.webinar;
  const L = getLang();
  const status = w.done ? html`<span class="chip ok">✓ ${w.bonus ? t('webinar.attended_bonus') : t('webinar.attended_elective')}</span>`
    : w.recording_watched ? html`<span class="chip ok">✓ ${t('webinar.recording_done')}</span>`
    : w.excused ? html`<span class="chip info">${t('webinar.excused_note')}</span>`
    : w.checked_in_at ? html`<span class="chip pending">${t('webinar.checked_in_at', { time: fmtDateTime(w.checked_in_at) })}</span>`
    : html`<span class="chip neutral">${t('webinar.not_attended')}</span>`;
  const canIn = !locked && w.checkin_open && !w.checked_in_at;
  const canOut = !locked && w.checkout_open && w.checked_in_at && !w.checked_out_at;
  const hint = w.done ? '' : !w.checked_in_at ? (w.checkin_open ? '' : t('webinar.checkin_closed_note'))
    : (!w.checked_out_at && !w.checkout_open ? t('webinar.checkout_closed_note') : '');
  // Anyone who missed the live session meets the mandatory requirement by watching the recording
  // (opened from here first, then confirmed). It satisfies the requirement but earns no credits.
  const needsRecording = !w.done && !w.excused && !w.recording_watched;
  const recording = w.done || !w.recording_url ? '' : html`<div class="activity" style="margin-top:.7rem">
      <div><h3>${t('webinar.recording_title')}</h3>
        <div class="meta">${w.recording_watched ? html`<span class="chip ok">✓ ${t('webinar.recording_done')}</span>` : needsRecording ? html`<span class="chip pending">${t('webinar.mandatory')}</span>` : ''}</div>
        <p class="muted small" style="margin:.5rem 0 0">${w.recording_watched ? t('webinar.recording_ok') : needsRecording ? t('webinar.recording_required') : t('webinar.recording_optional')}</p>
        ${needsRecording ? html`<p class="muted small" style="margin:.4rem 0 0">${t('webinar.recording_confirm_hint')}</p>` : ''}</div>
      <div class="actions"><div class="row" style="flex-wrap:nowrap">
        <a class="btn ${needsRecording && !w.recording_opened ? '' : 'secondary'}" data-rec-open href="${safeUrl(w.recording_url)}" target="_blank" rel="noopener noreferrer">${t('webinar.recording_watch')} ↗</a>
        ${needsRecording ? html`<button class="btn" type="button" data-act="webinar-rec-confirm" ${w.recording_opened && !locked ? '' : raw('disabled')}>${t('webinar.recording_confirm')}</button>` : ''}</div></div>
    </div>`;
  return html`<section class="cat-block ${wp.complete ? 'closed' : ''}"><div class="cat-head"><span class="dot" style="background:var(--elective)"></span>
      <h2>${t('cat.webinar')}</h2><span class="chip pending">${t('webinar.mandatory')}</span>
      ${wp.complete ? html`<span class="chip ok">✓ ${t('learn.cat_complete')}</span>` : ''}${wp.priority ? html`<span class="chip credits">★ ${t('webinar.priority_chip')}</span>` : ''}</div>
    <div class="activity">
      <div><h3>${a[L]}</h3>
        <div class="meta"><span class="chip credits">${a.credits} ${t('learn.credits')}</span>${status}</div>
        <p class="muted small" style="margin:.5rem 0 0">${t('webinar.rule')}</p></div>
      <div class="actions"><div class="row" style="flex-wrap:nowrap">
        ${w.done ? '' : html`<button class="btn" type="button" data-act="webinar-in" ${canIn ? '' : raw('disabled')}>${t('webinar.check_in')}</button>
        <button class="btn" type="button" data-act="webinar-out" ${canOut ? '' : raw('disabled')}>${t('webinar.check_out')}</button>`}</div></div>
      ${hint ? html`<div class="sub"><span class="muted small">${hint}</span></div>` : ''}
    </div>${recording}</section>`;
}

export async function learningView() {
  await api.refreshMe();
  const cfg = state.config;
  const [claims, unicefStatus, webinar] = await Promise.all([api.myClaims(), api.myUnicefStatus(), api.myWebinarStatus()]);
  const progress = state.progress;
  const locked = isLocked();
  const ctx = { claims, progress, locked, unicefDone: unicefStatus.filter((m) => m.completed).length, unicefTotal: unicefStatus.length };
  const pct = Math.min(100, Math.round((progress.total / progress.required) * 100));
  const cats = ['core', 'elective', 'soft'];
  return {
    html: html`<div class="main-head"><h1>${t('nav.learning')}</h1></div>
    ${locked ? html`<div class="banner bad"><span>🔒</span><div>${t('learn.closed_banner')}</div></div>`
      : html`<div class="banner"><span>⏰</span><div>${t('learn.deadline_banner', { date: fmtDate(`${cfg.displayDeadline}T12:00:00+04:00`, { dateStyle: 'long' }) })}</div></div>`}
    ${progress.qualified ? html`<div class="banner ok"><span>🎉</span><div><b>${t('learn.qualified')}</b> ${t('learn.qualified_text')}</div></div>` : ''}
    ${!progress.qualified && progress.base_total >= progress.required && !progress.categories.webinar.complete ? html`<div class="banner"><span>🎥</span><div>${t('webinar.banner_missing')}</div></div>` : ''}
    <div class="card overall">
      <div class="ring" style="--p:${pct}" role="img" aria-label="${progress.total}/${progress.required}"><div><div><b>${progress.total}</b><br><span>/ ${progress.required}</span></div></div></div>
      <div><h2 style="font-size:1.3rem;margin-bottom:.3rem">${t('learn.requirements')}</h2><p class="muted small">${t('learn.requirements_text')}</p>
        <div class="cat-mini">${cats.map((c) => { const p = progress.categories[c];
          return html`<div><div class="top"><span>${t(`cat.${c}`)}</span><span>${p.earned} / ${p.required}${p.pending ? html` <span class="muted">(+${p.pending} ${t('learn.pending_short')})</span>` : ''}</span></div>
            <div class="bar ${c}"><i style="width:${(p.earned / p.required) * 100}%"></i><i class="pend" style="width:${Math.min(p.pending, p.required - p.earned) / p.required * 100}%"></i></div></div>`; })}</div></div></div>
    ${cats.map((c) => { const p = progress.categories[c];
      return html`<section class="cat-block ${p.complete ? 'closed' : ''}"><div class="cat-head"><span class="dot" style="background:var(--${c})"></span>
        <h2>${t(`cat.${c}`)} — ${p.required} ${t('learn.credits')}</h2>
        ${p.complete ? html`<span class="chip ok">✓ ${t('learn.cat_complete')}</span>` : p.full ? html`<span class="chip pending">${t('learn.cat_full_short')}</span>` : ''}</div>
        ${cfg.activities.filter((a) => a.category === c).map((a) => activityRow(a, ctx))}</section>`; })}
    <div id="webinar-slot">${webinarHtml(webinar, progress)}</div>`,
    mount(root) {
      const slot = () => root.querySelector('#webinar-slot');
      const draw = (w) => { const el = slot(); if (el) el.innerHTML = webinarHtml(w, state.progress).s; };
      const refresh = async () => { try { draw(await api.myWebinarStatus()); } catch { /* keep showing the last state */ } };
      actions['webinar-in'] = async (el) => {
        setBusy(el, true, t('common.wait'));
        try { draw(await api.webinarCheckIn()); toast(t('webinar.checked_in_ok')); } catch (e) { toast(errText(e), 'bad'); await refresh(); }
      };
      actions['webinar-out'] = async (el) => {
        setBusy(el, true, t('common.wait'));
        try { await api.webinarCheckOut(); toast(t('webinar.checked_out_ok')); navigate(location.pathname); }
        catch (e) { toast(errText(e), 'bad'); await refresh(); }
      };
      // Opening the recording is recorded (the confirm button needs it); the link itself opens normally in a new tab.
      slot().addEventListener('click', async (e) => {
        if (!e.target.closest('[data-rec-open]')) return;
        try { draw(await api.webinarOpenRecording()); } catch { /* the link still opens */ }
      });
      actions['webinar-rec-confirm'] = async (el) => {
        setBusy(el, true, t('common.wait'));
        try { await api.webinarConfirmRecording(); toast(t('webinar.recording_ok')); navigate(location.pathname); }
        catch (e) { toast(errText(e), 'bad'); await refresh(); }
      };
      // The manager opens/closes each window live during the event, so keep the buttons current.
      const timer = setInterval(() => { if (!slot()) clearInterval(timer); else refresh(); }, 10000);
    },
  };
}

// ── Roles (volunteer roles; first one: Rapporteur) ─────────────────────────
// Month names come from a table, not Intl: browsers without Armenian locale data silently fall back to English.
function roleBlocks(blocks) {
  return blocks.map((b) => (b.p ? html`<p>${b.p}</p>`
    : b.quotes ? html`<ul class="role-quotes">${b.quotes.map((q) => html`<li>${q}</li>`)}</ul>`
    : html`<ul>${b.ul.map((i) => html`<li>${i}</li>`)}</ul>`));
}

const FULL_DAYS = () => (getLang() === 'hy' ? '19–30 հոկտեմբերի' : '19–30 October');

function teamCard(key, r, bz) {
  const L = getLang(), tm = TEAMS[key];
  const st = r.status; // null | pending | approved | rejected
  const chip = st === 'approved' ? html`<span class="chip ok">✓ ${t('roles.st_approved')}</span>`
    : st === 'pending' ? html`<span class="chip pending">${t('roles.st_pending')}</span>`
    : st === 'rejected' ? html`<span class="chip bad">${t('roles.st_rejected')}</span>`
    : !r.eligible ? html`<span class="chip neutral">🔒 ${t('roles.qualified_only')}</span>` : '';
  const canApply = !st && r.open && r.eligible;
  const cap = r.capacity ? `${r.approved}/${r.capacity}` : `${r.approved}/${t('roles.tbd')}`;
  const needsRec = r.needs_recording && r.signed_up && !r.recording_watched;
  const recording = !r.needs_recording || !r.signed_up || !r.recording_url ? '' : html`<div class="activity" style="margin:1rem 0">
      <div><h3>${t('roles.recording_title')}</h3>
        <div class="meta">${r.recording_watched ? html`<span class="chip ok">✓ ${t('roles.recording_done')}</span>` : html`<span class="chip pending">${t('roles.recording_pending')}</span>`}</div>
        ${needsRec ? html`<p class="muted small" style="margin:.4rem 0 0">${t('roles.recording_hint')}</p>` : ''}</div>
      <div class="row"><a class="btn ${needsRec && !r.recording_opened ? '' : 'secondary'}" data-rec-open data-role="${key}" href="${safeUrl(r.recording_url)}" target="_blank" rel="noopener noreferrer">${t('roles.recording_watch')} ↗</a>
        ${needsRec ? html`<button class="btn" type="button" data-act="role-rec-confirm" data-role="${key}" ${r.recording_opened ? '' : raw('disabled')}>${t('roles.recording_confirm')}</button>` : ''}</div></div>`;
  const note = st === 'approved' ? t('roles.note_approved') : st === 'pending' ? t('roles.note_pending') : st === 'rejected' ? t('roles.note_rejected')
    : !r.eligible ? t('roles.not_eligible_note') : t('roles.note_apply');
  return html`<div class="card team-card" style="--c:${tm.color}"><div class="row" style="align-items:center;gap:.6rem"><span class="dot big"></span><h2 style="margin:0;font-size:1.3rem">${tm.name[L]}</h2>${chip}</div>
    <div class="chips" style="margin:.7rem 0">
      <span class="chip info">👥 ${t('roles.applied', { n: r.applied })}</span>
      <span class="chip ${r.capacity && r.approved >= r.capacity ? 'bad' : 'credits'}">✓ ${t('roles.approved_cap', { cap })}</span>
      <span class="chip neutral">📅 ${FULL_DAYS()}</span>
      ${r.min_hours ? html`<span class="chip neutral">⏱ ${t('roles.min_hours', { n: r.min_hours })}</span>` : ''}
      ${tm.note[L] ? html`<span class="chip neutral">📍 ${tm.note[L]}</span>` : ''}</div>
    <ul class="team-tasks">${tm.tasks[L].map((x) => html`<li>${x}</li>`)}</ul>
    ${tm.extra ? tm.extra[L].map((x) => html`<p class="muted small" style="margin:.4rem 0">${x}</p>`) : ''}
    ${key === 'rapporteur' && bz?.answered ? html`<p class="small" style="margin:.6rem 0">🔵 ${t('bz.your_answer')}: <b>${bz.has_access ? t('bz.answer_yes') : t('bz.answer_no')}</b> <button class="link-btn" type="button" data-act="bz-change">${t('bz.change')}</button></p>` : ''}
    ${recording}
    <div class="row" style="margin-top:1rem">
      ${!st ? html`<button class="btn" type="button" data-act="role-signup" data-role="${key}" ${canApply ? '' : raw('disabled')}>${t('roles.apply')}</button>` : ''}
      ${r.signed_up ? html`<a class="btn" href="/app/schedule" data-link>📅 ${t('roles.plan_schedule')}</a>` : ''}
      ${tm.rapporteur ? html`<a class="btn secondary" href="${safeUrl(CONTENT.rapporteur.templateUrl)}" target="_blank" rel="noopener noreferrer">${t('roles.template')} ↗</a>` : ''}
      ${r.signed_up ? html`<button class="btn ghost" type="button" data-act="role-cancel" data-role="${key}">${t('roles.cancel')}</button>` : ''}</div>
    <p class="muted small" style="margin:.8rem 0 0">${note}</p></div>`;
}

export async function rolesView() {
  let [roles, bz] = await Promise.all([api.myRoles(), api.myBlueZone().catch(() => null)]);
  const L = getLang(), c = CONTENT.rapporteur;
  const list = () => TEAM_ORDER.filter((k) => roles[k]).map((k) => teamCard(k, roles[k], bz));
  return {
    html: html`<div class="main-head"><h1>${t('roles.title')}</h1><div class="grow"></div><a class="btn secondary" href="/app/schedule" data-link>📅 ${t('nav.schedule')}</a></div>
      <p class="muted" style="max-width:760px">${t('roles.intro')}</p>
      <div class="team-list" id="role-slot">${list()}</div>
      <h2 style="margin-top:2rem;font-size:1.4rem">${t('roles.instructions')}</h2>
      <div class="role-guide">${c[L].sections.map((s) => html`<section class="card flat" style="margin-bottom:1rem"><h3 style="margin-top:0">${s.title}</h3>${roleBlocks(s.blocks)}</section>`)}</div>`,
    mount(root) {
      const slot = root.querySelector('#role-slot');
      const redraw = () => { slot.innerHTML = list().map((x) => x.s).join(''); };
      actions['bz-change'] = async () => { await askBlueZone({ force: true }); bz = await api.myBlueZone().catch(() => bz); roles = await api.myRoles(); redraw(); };
      actions['role-signup'] = async (el) => {
        setBusy(el, true, t('common.wait'));
        try { roles = await api.signupRole(el.dataset.role); toast(t('roles.signed_ok')); redraw(); }
        catch (e) { toast(errText(e), 'bad'); setBusy(el, false); }
      };
      actions['role-cancel'] = async (el) => {
        if (!(await confirmDialog({ title: t('roles.cancel'), message: t('roles.cancel_confirm'), danger: true, confirmText: t('roles.cancel') }))) return;
        setBusy(el, true, t('common.wait'));
        try { roles = await api.cancelRole(el.dataset.role); toast(t('roles.cancelled')); redraw(); }
        catch (e) { toast(errText(e), 'bad'); setBusy(el, false); }
      };
      // Opening the recording is recorded (the confirm button needs it); the link itself opens normally in a new tab.
      slot.addEventListener('click', async (e) => {
        const link = e.target.closest('[data-rec-open]'); if (!link) return;
        try { roles = await api.roleOpenRecording(link.dataset.role); redraw(); } catch { /* the link still opens */ }
      });
      actions['role-rec-confirm'] = async (el) => {
        setBusy(el, true, t('common.wait'));
        try { roles = await api.roleConfirmRecording(el.dataset.role); toast(t('roles.watched_ok')); redraw(); }
        catch (e) { toast(errText(e), 'bad'); setBusy(el, false); }
      };
    },
  };
}

// ── My schedule: an interactive calendar for the days of COP17 ──────────────
export async function scheduleView() {
  const [roles, shifts] = await Promise.all([api.myRoles(), api.myShifts()]);
  const mine = TEAM_ORDER.filter((k) => roles[k]?.signed_up);
  if (!mine.length) {
    return { html: html`<div class="main-head"><h1>${t('nav.schedule')}</h1></div><div class="empty"><p>${t('cal.no_roles')}</p><a class="btn" href="/app/roles" data-link>${t('nav.roles')}</a></div>` };
  }
  const slots = new Map(shifts.map((s) => [slotKey(s.day, s.hour), s.role]));
  let brush = mine[0];
  const pending = new Map();
  let timer = null, saving = false, failed = false;

  const cellOf = (d, h) => { const tm = slots.get(slotKey(d, h)); return tm ? { cls: 'filled', style: `--c:${teamColor(tm)}`, title: teamName(tm) } : { title: '' }; };
  const dayExtra = (d) => html`<button type="button" class="cal-copy" data-act="cal-copy" data-d="${d}" title="${t('cal.copy_hint')}" aria-label="${t('cal.copy_hint')}">⧉</button>`;
  const grid = () => calGrid({ cell: cellOf, dayExtra, interactive: true, label: t('nav.schedule') });
  const hoursOpts = (from, to, sel) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => html`<option value="${h}" ${h === sel ? raw('selected') : ''}>${hourLabel(h)}</option>`);
  const total = () => [...slots.values()].length;
  return {
    html: html`<div class="main-head"><h1>${t('nav.schedule')}</h1><div class="grow"></div><span class="cal-status" id="cal-status" role="status"></span></div>
      <p class="muted" style="max-width:760px">${t('cal.intro')}</p>
      <div class="card flat cal-tools">
        <div class="small muted" style="margin-bottom:.4rem">${t('cal.pick_team')}</div>
        <div id="cal-legend">${legendHtml(mine, { eraser: true, active: brush, interactive: true })}</div>
        <details class="cal-quick"><summary>${t('cal.quick')}</summary>
          <div class="row" style="align-items:flex-end;margin-top:.6rem">
            <div class="field" style="margin:0"><label for="qf-team">${t('cal.team')}</label><select id="qf-team">${mine.map((k) => html`<option value="${k}">${teamName(k)}</option>`)}</select></div>
            <div class="field" style="margin:0"><label for="qf-from">${t('cal.from')}</label><select id="qf-from">${hoursOpts(FIRST_HOUR, LAST_HOUR, 10)}</select></div>
            <div class="field" style="margin:0"><label for="qf-to">${t('cal.to')}</label><select id="qf-to">${hoursOpts(FIRST_HOUR + 1, LAST_HOUR + 1, 14)}</select></div></div>
          <div class="chips" id="qf-days" style="margin:.7rem 0">${EVENT_DAYS.map((d) => html`<label class="cal-day-chip"><input type="checkbox" value="${d}" checked> <span>${dayParts(d).wd} ${dayParts(d).num}</span></label>`)}</div>
          <div class="row"><button class="btn sm" type="button" data-act="qf-apply">${t('cal.apply')}</button><button class="btn secondary sm" type="button" data-act="qf-clear">${t('cal.clear_sel')}</button>
            <button class="btn ghost sm" type="button" data-act="qf-all">${t('cal.all_days')}</button><button class="btn ghost sm" type="button" data-act="qf-weekdays">${t('cal.weekdays')}</button></div>
        </details></div>
      <div id="cal-grid">${grid()}</div>
      <p class="muted small" style="margin:.7rem 0">${t('cal.tips')}</p>
      <h2 style="font-size:1.2rem;margin:1.2rem 0 .5rem">${t('cal.workload')} <span class="chip info" id="cal-total">${t('cal.hours_total', { n: total() })}</span></h2>
      <div id="cal-work">${workloadHtml(mine, slots, roles)}</div>
      <p class="muted small">${t('cal.shared_note')}</p>`,
    mount(root) {
      const status = root.querySelector('#cal-status');
      const setStatus = (kind, extra = '') => {
        status.className = `cal-status ${kind}`;
        status.innerHTML = kind === 'saving' ? `<span class="spinner"></span> ${esc(t('cal.saving'))}` : kind === 'saved' ? `✓ ${esc(t('cal.saved'))}`
          : kind === 'error' ? `⚠ ${esc(extra)} <button class="link-btn" type="button" data-act="cal-retry">${esc(t('cal.retry'))}</button>` : '';
      };
      const cellEl = (d, h) => root.querySelector(`.cal-cell[data-d="${d}"][data-h="${h}"]`);
      let workTimer = 0;
      const refreshWork = () => {
        clearTimeout(workTimer);
        workTimer = setTimeout(() => {
          root.querySelector('#cal-work').innerHTML = workloadHtml(mine, slots, roles).s;
          root.querySelector('#cal-total').textContent = t('cal.hours_total', { n: total() });
        }, 30);
      };
      const flush = async () => {
        if (saving || !pending.size) return;
        saving = true; failed = false; setStatus('saving');
        const batch = [...pending]; pending.clear();
        try {
          await api.setMyShifts(batch.map(([k, tm]) => { const [day, hour] = k.split('|'); return { day, hour: Number(hour), role: tm }; }));
        } catch (e) {
          for (const [k, v] of batch) if (!pending.has(k)) pending.set(k, v);
          failed = true; setStatus('error', errText(e));
        }
        saving = false;
        if (!failed) { if (pending.size) flush(); else setStatus('saved'); }
      };
      const queueSave = () => { clearTimeout(timer); failed = false; setStatus('saving'); timer = setTimeout(flush, 500); };
      const set = (d, h, tm) => {
        const k = slotKey(d, h);
        if ((slots.get(k) || null) === (tm || null)) return;
        if (tm) slots.set(k, tm); else slots.delete(k);
        pending.set(k, tm || null);
        const el = cellEl(d, h);
        if (el) { el.classList.toggle('filled', !!tm); el.style.cssText = tm ? `--c:${teamColor(tm)}` : ''; el.title = tm ? teamName(tm) : ''; }
        queueSave(); refreshWork();
      };
      window.addEventListener('beforeunload', (e) => { if (pending.size) { e.preventDefault(); e.returnValue = ''; } });
      bindPaint(root.querySelector('#cal-grid'), {
        onStart: (d, h) => (brush === '__erase' ? 'erase' : slots.get(slotKey(d, h)) === brush ? 'erase' : 'paint'),
        onApply: (d, h, mode) => set(d, h, mode === 'paint' ? brush : null),
      });
      actions['cal-brush'] = (el) => {
        brush = el.dataset.team;
        root.querySelector('#cal-legend').innerHTML = legendHtml(mine, { eraser: true, active: brush, interactive: true }).s;
        if (brush !== '__erase') root.querySelector('#qf-team').value = brush;
      };
      actions['cal-retry'] = () => { failed = false; flush(); };
      actions['cal-row'] = (el) => {
        const h = Number(el.dataset.h);
        if (brush === '__erase') { for (const d of EVENT_DAYS) set(d, h, null); return; }
        const all = EVENT_DAYS.every((d) => slots.get(slotKey(d, h)) === brush);
        for (const d of EVENT_DAYS) set(d, h, all ? null : brush);
      };
      actions['cal-copy'] = async (el) => {
        const src = el.dataset.d;
        if (!(await confirmDialog({ title: t('cal.copy_title'), message: t('cal.copy_confirm', { day: dayParts(src).long }), confirmText: t('cal.copy_go') }))) return;
        for (const d of EVENT_DAYS) if (d !== src) for (const h of HOURS) set(d, h, slots.get(slotKey(src, h)) || null);
      };
      const chosenDays = () => [...root.querySelectorAll('#qf-days input:checked')].map((i) => i.value);
      const range = () => { const a = Number(root.querySelector('#qf-from').value), b = Number(root.querySelector('#qf-to').value); return HOURS.filter((h) => h >= a && h < b); };
      actions['qf-apply'] = () => { const tm = root.querySelector('#qf-team').value; for (const d of chosenDays()) for (const h of range()) set(d, h, tm); };
      actions['qf-clear'] = () => { for (const d of chosenDays()) for (const h of range()) set(d, h, null); };
      const tick = (fn) => root.querySelectorAll('#qf-days input').forEach((i) => { i.checked = fn(i.value); });
      actions['qf-all'] = () => tick(() => true);
      actions['qf-weekdays'] = () => tick((d) => { const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); return wd >= 1 && wd <= 5; });
    },
  };
}

// ── Letters of standing (Տեղեկանք) ──────────────────────────────────────────
const letterLangLabel = (l) => t(`let.lang_${l}`);
function letterDownloads(r) {
  const btns = r.lang === 'both' ? ['hy', 'en', 'both'] : [r.lang];
  return html`<div class="row" style="gap:.3rem">${btns.map((w) => html`<button class="btn secondary sm" type="button" data-act="letter-dl" data-id="${r.id}" data-which="${w}">⬇ ${t(`let.dl_${w}`)}</button>`)}</div>`;
}

export async function lettersView() {
  const qualified = !!state.progress?.qualified;
  let letters = await api.myLetters();
  const pr = state.profile || {};
  const num = (r) => `AUCB-BA${String(r.serial).padStart(3, '0')}`;
  const table = () => (letters.length
    ? html`<div class="table-wrap"><table><thead><tr><th>${t('let.col_number')}</th><th>${t('let.col_lang')}</th><th>${t('let.col_date')}</th><th>${t('let.col_status')}</th><th></th></tr></thead><tbody>
      ${letters.map((r) => html`<tr class="${r.voided_at ? 'muted' : ''}"><td><b>${num(r)}</b></td><td>${letterLangLabel(r.lang)}</td><td class="small">${fmtDate(r.created_at)}</td>
        <td>${r.voided_at ? html`<span class="chip bad">${t('let.voided')}</span>` : html`<span class="chip ok">✓ ${t('let.issued')}</span>`}</td>
        <td>${r.voided_at ? '' : html`<div class="row" style="gap:.4rem">${letterDownloads(r)}<button class="btn ghost sm danger" type="button" data-act="letter-void" data-id="${r.id}">${t('let.void')}</button></div>`}</td></tr>`)}</tbody></table></div>`
    : html`<div class="empty">${t('let.none')}</div>`);
  const field = (name, label, value = '', extra = '') => html`<div class="field"><label for="lt-${name}">${label} *</label><input id="lt-${name}" name="${name}" type="text" maxlength="60" value="${value}" ${raw(extra)} required></div>`;
  return {
    html: html`<div class="main-head"><h1>${t('nav.letters')}</h1></div>
      <p class="muted" style="max-width:760px">${t('let.intro')}</p>
      ${!qualified ? html`<div class="banner"><span>🔒</span><div>${t('let.qualified_only')}</div></div>` : html`
      <div class="card" style="max-width:820px"><h2 style="font-size:1.3rem">${t('let.new')}</h2>
        <form data-form="letter" novalidate>
          <div class="field"><label>${t('let.lang')} *</label><div class="chips" id="lt-langs">
            ${['hy', 'en', 'both'].map((l, i) => html`<label class="cal-day-chip"><input type="radio" name="lang" value="${l}" ${i === 0 ? raw('checked') : ''}> <span>${t(`let.lang_${l}`)}</span></label>`)}</div></div>
          <div id="lt-hy"><div class="grid-2">${field('first_name_hy', t('let.first_hy'), pr.first_name_hy || '')}${field('last_name_hy', t('let.last_hy'), pr.last_name_hy || '')}</div>
            ${field('patronymic_hy', t('let.patr_hy'))}</div>
          <div id="lt-en" hidden><div class="grid-2">${field('first_name_en', t('let.first_en'), pr.first_name_en || '')}${field('last_name_en', t('let.last_en'), pr.last_name_en || '')}</div>
            <p class="muted small" style="margin:-.3rem 0 .8rem">${t('let.en_note')}</p></div>
          <div class="grid-2"><div class="field"><label for="lt-pn">${t('let.passport_number')} *</label><input id="lt-pn" name="passport_number" type="text" maxlength="20" required></div>
            <div class="field"><label for="lt-pon">${t('let.issued_on')} *</label><input id="lt-pon" name="passport_issued_on" type="date" min="1990-01-01" max="${new Date().toISOString().slice(0, 10)}" required></div></div>
          <div class="field"><label for="lt-pby">${t('let.issued_by')} *</label><input id="lt-pby" name="passport_issued_by" type="text" maxlength="120" required><div class="hint">${t('let.issued_by_hint')}</div></div>
          <div class="field" id="lt-pbe" hidden><label for="lt-pbe-in">${t('let.issued_by_en')} *</label><input id="lt-pbe-in" name="passport_issued_by_en" type="text" maxlength="120"></div>
          <p class="muted small">${t('let.limit_note')}</p>
          <button class="btn" type="submit">${t('let.submit')}</button></form></div>`}
      <h2 style="font-size:1.3rem;margin-top:2rem">${t('let.mine')}</h2>
      <div id="lt-list">${table()}</div>`,
    mount(root) {
      const form = root.querySelector('form[data-form=letter]');
      const redraw = () => { root.querySelector('#lt-list').innerHTML = table().s; };
      if (form) {
        const val = (n) => form.elements[n].value.trim();
        const sync = () => {
          const lang = form.elements.lang.value;
          root.querySelector('#lt-hy').hidden = lang === 'en'; root.querySelector('#lt-en').hidden = lang === 'hy';
          // the issuing authority needs a Latin version when it is written in Armenian and an English letter is wanted
          const needEn = lang !== 'hy' && /[Ա-և]/.test(val('passport_issued_by'));
          root.querySelector('#lt-pbe').hidden = !needEn;
        };
        form.addEventListener('change', sync); form.addEventListener('input', sync); sync();
        forms.letter = async () => {
          const lang = form.elements.lang.value, needEn = lang !== 'hy', needHy = lang !== 'en';
          const d = { lang, passport_number: val('passport_number'), passport_issued_on: val('passport_issued_on'), passport_issued_by: val('passport_issued_by') };
          if (needHy) Object.assign(d, { first_name_hy: val('first_name_hy'), last_name_hy: val('last_name_hy'), patronymic_hy: val('patronymic_hy') });
          if (needEn) Object.assign(d, { first_name_en: val('first_name_en'), last_name_en: val('last_name_en'), passport_issued_by_en: val('passport_issued_by_en') || null });
          const missing = !d.passport_number || !d.passport_issued_on || !d.passport_issued_by
            || (needHy && (!d.first_name_hy || !d.last_name_hy || !d.patronymic_hy)) || (needEn && (!d.first_name_en || !d.last_name_en || (/[Ա-և]/.test(d.passport_issued_by) && !d.passport_issued_by_en)));
          if (missing) return formMsg(form, t('err.required'));
          if (needHy && ![d.first_name_hy, d.last_name_hy, d.patronymic_hy].every((x) => /[Ա-և]/.test(x))) return formMsg(form, t('let.err_armenian'));
          if (needEn && [d.first_name_en, d.last_name_en].some((x) => /[Ա-և]/.test(x))) return formMsg(form, t('let.err_latin'));
          if (!(await confirmDialog({ title: t('let.confirm_title'), message: t('let.confirm_text'), confirmText: t('let.confirm_go') }))) return;
          const btn = form.querySelector('[type=submit]'); setBusy(btn, true, t('common.wait'));
          try {
            const rec = await api.requestLetter(d);
            letters = await api.myLetters();
            toast(t('let.created', { num: num(rec) }));
            form.reset(); sync(); redraw();
            await downloadLetter(rec, rec.lang);
          } catch (e) { formMsg(form, errText(e)); }
          setBusy(btn, false);
        };
      }
      actions['letter-dl'] = async (el) => {
        const rec = letters.find((x) => String(x.id) === el.dataset.id); setBusy(el, true, t('common.wait'));
        try { await downloadLetter(rec, el.dataset.which); } catch (e) { toast(errText(e), 'bad'); }
        setBusy(el, false);
      };
      actions['letter-void'] = async (el) => {
        const rec = letters.find((x) => String(x.id) === el.dataset.id);
        if (!(await confirmDialog({ title: t('let.void'), message: t('let.void_confirm', { num: num(rec) }), danger: true, confirmText: t('let.void') }))) return;
        setBusy(el, true, t('common.wait'));
        try { await api.voidLetter(rec.id); letters = await api.myLetters(); toast(t('let.void_done')); redraw(); }
        catch (e) { toast(errText(e), 'bad'); setBusy(el, false); }
      };
    },
  };
}

// claim flows ----------------------------------------------------------------
const actOf = (key) => state.config.activities.find((a) => a.key === key);
const done = (m) => { m.close(); navigate(location.pathname); };
const ALLOWED = /\.(pdf|jpe?g|png|webp)$/i;
const checkFiles = (files, { max = 5, required = true } = {}) => {
  if (required && !files.length) throw new Error('file_required');
  if (files.length > max) throw new Error('too_many_files');
  for (const f of files) {
    if (!ALLOWED.test(f.name) || f.size > 10 * 1024 * 1024) throw new Error('invalid_file');
  }
};

actions['claim-checkin'] = (el) => {
  const a = actOf(el.dataset.key), p = state.profile || {};
  const m = openModal({
    title: `${a[getLang()]} — ${t('learn.claim')}`,
    body: html`<p class="muted small">${t('claim.checkin_intro')}</p>
      <form data-form="claim-checkin" novalidate><input type="hidden" name="key" value="${a.key}">
        <div class="field"><label for="ck-name">${t('claim.full_name')} *</label><input id="ck-name" name="full_name" type="text" maxlength="200" value="${`${p.first_name || ''} ${p.last_name || ''}`.trim()}" required></div>
        <div class="field"><label for="ck-email">${t('auth.email')} *</label><input id="ck-email" name="email" type="email" maxlength="200" value="${state.account?.email || ''}" required></div>
        ${universityField(p.university, 'ck')}
        <label class="check field"><input type="checkbox" name="confirmed"> <span>${t('claim.checkin_tick')}</span></label>
        <div class="modal-foot"><button class="btn secondary" type="button" data-modal-close>${t('common.cancel')}</button><button class="btn" type="submit">${t('learn.claim')}</button></div></form>`,
  });
  forms['claim-checkin'] = async (form) => {
    const btn = form.querySelector('[type=submit]'); const v = (n) => form.elements[n].value.trim();
    const university = readUniversity(form, 'ck');
    if (!v('full_name') || !v('email') || !university) return formMsg(form, t('err.required'));
    if (!form.elements.confirmed.checked) return formMsg(form, t('claim.err_tick'));
    setBusy(btn, true, t('common.wait'));
    try { await api.submitClaim(a.key, { full_name: v('full_name'), email: v('email'), university, checkin_confirmed: true }, []); toast(t('claim.sent')); done(m); }
    catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
  };
};

actions['claim-simple'] = (el) => {
  const a = actOf(el.dataset.key);
  const m = openModal({
    title: a[getLang()], body: html`<p>${t('claim.simple_text')}</p>
      <form data-form="claim-simple" novalidate><div class="modal-foot"><button class="btn secondary" type="button" data-modal-close>${t('common.cancel')}</button><button class="btn" type="submit">${t('learn.claim_credits')}</button></div></form>`,
  });
  forms['claim-simple'] = async (form) => {
    const btn = form.querySelector('[type=submit]'); setBusy(btn, true, t('common.wait'));
    try { await api.submitClaim(a.key, {}, []); toast(t('claim.sent')); done(m); }
    catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
  };
};

actions['claim-cert'] = (el) => {
  const a = actOf(el.dataset.key);
  const m = openModal({
    title: `${a[getLang()]} — ${t('learn.upload_cert')}`,
    body: html`<p class="muted small">${t('claim.cert_intro')}</p>
      <form data-form="claim-cert" novalidate>
        <div class="field"><label for="cf">${t('claim.certificate')} *</label><input id="cf" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" required><div class="hint">${t('claim.file_hint')}</div></div>
        <div class="modal-foot"><button class="btn secondary" type="button" data-modal-close>${t('common.cancel')}</button><button class="btn" type="submit">${t('claim.submit')}</button></div></form>`,
  });
  forms['claim-cert'] = async (form) => {
    const btn = form.querySelector('[type=submit]'); const files = [...form.elements.file.files];
    try { checkFiles(files, { max: 1 }); } catch (e) { return formMsg(form, errText(e)); }
    setBusy(btn, true, t('common.uploading'));
    try {
      const up = await api.uploadCertificates(files);
      const id = await api.submitClaim(a.key, {}, up);
      api.scanCertificate(id);
      toast(t('claim.sent')); done(m);
    } catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
  };
};

actions['claim-form'] = (el) => {
  const a = actOf(el.dataset.key);
  const filesLabel = a.filesLabel || (a.key === 'campaign' ? 'certificate_or_images' : 'certificate');
  const m = openModal({
    title: `${a[getLang()]} — ${t('learn.upload_cert')}`, wide: true,
    body: html`<p class="muted small">${t('claim.form_intro')}</p>
      <form data-form="claim-form" novalidate>
        <div class="field"><label for="fp-name">${t('claim.project_name')} *</label><input id="fp-name" name="project_name" type="text" maxlength="200" required></div>
        <div class="grid-2"><div class="field"><label for="fp-from">${t('claim.date_from')} *</label><input id="fp-from" name="date_from" type="date" required></div>
          <div class="field"><label for="fp-to">${t('claim.date_to')} *</label><input id="fp-to" name="date_to" type="date" required></div></div>
        <div class="field"><label for="fp-desc">${t('claim.description')} *</label><textarea id="fp-desc" name="description" maxlength="8000" style="min-height:170px" required></textarea>
          <div class="counter" id="desc-counter" aria-live="polite"></div></div>
        <div class="field"><label for="fp-files">${t(filesLabel === 'certificate_or_images' ? 'claim.certificate_or_images' : 'claim.certificate')} *</label>
          <input id="fp-files" name="files" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" required><div class="hint">${t('claim.files_hint')}</div></div>
        <div class="modal-foot"><button class="btn secondary" type="button" data-modal-close>${t('common.cancel')}</button><button class="btn" type="submit">${t('claim.submit')}</button></div></form>`,
  });
  const ta = m.el.querySelector('#fp-desc'), cnt = m.el.querySelector('#desc-counter');
  const upd = () => { const n = wordCount(ta.value); cnt.textContent = t('claim.words_min', { n, min: 100 }); cnt.className = `counter ${n >= 100 ? 'good' : ''}`; };
  ta.addEventListener('input', upd); upd();
  forms['claim-form'] = async (form) => {
    const btn = form.querySelector('[type=submit]'); const v = (n) => form.elements[n].value.trim();
    const files = [...form.elements.files.files];
    if (!v('project_name') || !v('date_from') || !v('date_to')) return formMsg(form, t('err.required'));
    if (v('date_to') < v('date_from')) return formMsg(form, t('claim.err_dates'));
    if (wordCount(v('description')) < 100) return formMsg(form, t('claim.err_words'));
    try { checkFiles(files); } catch (e) { return formMsg(form, errText(e)); }
    setBusy(btn, true, t('common.uploading'));
    try {
      const up = await api.uploadCertificates(files);
      await api.submitClaim(a.key, { project_name: v('project_name'), date_from: v('date_from'), date_to: v('date_to'), description: v('description') }, up);
      toast(t('claim.sent')); done(m);
    } catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
  };
};

// ── UNICEF course: sequential modules, locked videos (no skipping ahead), quiz per module ──
// All of the actual enforcement (module order, video order, no-skip rate limiting, the quiz answer
// key) lives server-side in report_video_progress()/submit_quiz() — this view is just the player.
const videoUrl = (v) => `${MEDIA_BASE}/unicef_modules/${v.dir}/${encodeURIComponent(v.filename)}`;
const PING_MS = 4000;

export async function unicefView() {
  await api.refreshMe();
  let status = await api.myUnicefStatus();
  const locked = isLocked();
  let openModuleId = null; // null = module list; otherwise showing that module's player/quiz

  const L = getLang();
  const modTitle = (m) => m[`title_${L}`];

  function listHtml() {
    const doneCount = status.filter((m) => m.completed).length;
    const allDone = doneCount === status.length;
    const pct = status.length ? Math.round((doneCount / status.length) * 100) : 0;
    return html`<div class="main-head"><div><a class="small" href="/app/learning" data-link>← ${t('nav.learning')}</a><h1>${t('unicef.title')}</h1></div></div>
      <p class="muted" style="max-width:720px">${t('unicef.intro')}</p>
      ${allDone ? html`<div class="banner ok"><span>🎉</span><div>${t('unicef.completed', { credits: 20 })}</div></div>`
        : locked ? html`<div class="banner bad"><span>🔒</span><div>${t('learn.closed_banner')}</div></div>` : ''}
      <div class="card" style="margin-bottom:1.2rem"><div class="row"><b>${t('unicef.progress')}</b><span class="muted">${doneCount} / ${status.length}</span><div class="grow"></div><span class="chip credits">20 ${t('learn.credits')}</span></div>
        <div class="bar core" style="margin-top:.6rem"><i style="width:${pct}%"></i></div></div>
      ${status.map((m) => {
        const videosDone = m.videos.filter((v) => v.completed).length;
        const sub = m.completed ? t('unicef.module_done')
          : !m.unlocked ? t('unicef.module_locked_note')
          : m.all_videos_done ? (m.quiz.attempted && !m.quiz.passed ? t('unicef.quiz_failed_note', { score: m.quiz.score, total: m.quiz.total }) : t('unicef.quiz_ready'))
          : t('unicef.videos_progress', { done: videosDone, total: m.videos.length });
        return html`<div class="module ${m.completed ? 'done' : ''}">
          <div class="num">${m.completed ? '✓' : m.unlocked ? m.sort : '🔒'}</div>
          <div><h3 style="margin:0;font-family:var(--font-body);font-size:1.02rem">${modTitle(m)}</h3><div class="muted small">${sub}</div></div>
          <div class="row">${m.unlocked
            ? html`<button class="btn ${m.completed ? 'secondary' : ''} sm" type="button" data-act="uni-open" data-id="${m.id}">${m.completed ? t('unicef.review') : t('unicef.continue_module')}</button>`
            : html`<span class="muted small">${t('unicef.locked_short')}</span>`}</div></div>`;
      })}
      <p class="muted small">${t('unicef.note')}</p>`;
  }

  function videoRowHtml(m, v, isCurrent) {
    const pct = v.duration ? Math.min(100, Math.round((v.max_time / v.duration) * 100)) : (v.completed ? 100 : 0);
    return html`<div class="module ${v.completed ? 'done' : ''} ${isCurrent ? 'current' : ''}" data-video-row="${v.id}">
      <div class="num">${v.completed ? '✓' : v.unlocked ? v.sort : '🔒'}</div>
      <div><h3 style="margin:0;font-family:var(--font-body);font-size:.95rem">${v[`title_${L}`]}</h3>
        <div class="bar sm core" style="margin-top:.35rem;max-width:220px"><i data-video-bar="${v.id}" style="width:${pct}%"></i></div></div>
      <div class="row">${v.completed ? html`<span class="chip ok">✓ ${t('unicef.watched')}</span>`
        : v.unlocked ? html`<span class="chip info">${t('unicef.now_watching')}</span>`
        : html`<span class="chip neutral">${t('unicef.locked_short')}</span>`}</div>
    </div>`;
  }

  function quizHtml(m, qs) {
    if (m.quiz.passed) {
      return html`<div class="banner ok"><span>✅</span><div>${t('unicef.quiz_passed_note', { score: m.quiz.score, total: m.quiz.total })}</div></div>`;
    }
    return html`<div class="card">
      <h3>${t('unicef.quiz_title')}</h3>
      ${m.quiz.attempted ? html`<div class="banner bad"><span>✕</span><div>${t('unicef.quiz_failed_note', { score: m.quiz.score, total: m.quiz.total })}</div></div>` : html`<p class="muted small">${t('unicef.quiz_intro')}</p>`}
      <form data-form="uni-quiz">
        ${qs.map((q, i) => html`<fieldset class="field" style="border:0;padding:0;margin-bottom:1.1rem">
          <legend style="font-weight:600;margin-bottom:.5rem">${i + 1}. ${L === 'hy' ? q.question_hy : q.question_en}</legend>
          ${q.options.map((o) => html`<label class="check" style="font-weight:400;margin-bottom:.3rem">
            <input type="radio" name="${q.id}" value="${o.key}" required> <span>${L === 'hy' ? o.hy : o.en}</span></label>`)}
        </fieldset>`)}
        <button class="btn" type="submit" ${locked ? raw('disabled') : ''}>${t('unicef.quiz_submit')}</button>
      </form></div>`;
  }

  async function moduleDetailHtml(m) {
    const current = m.videos.find((v) => v.unlocked && !v.completed);
    const qs = m.all_videos_done ? await api.unicefQuizQuestions(m.id) : [];
    return html`<div class="main-head"><div><button class="link-btn" type="button" data-act="uni-back">← ${t('unicef.back_to_modules')}</button><h1>${modTitle(m)}</h1></div></div>
      ${current ? html`<div class="card" style="margin-bottom:1rem">
        <video id="uni-player" data-video-id="${current.id}" data-max-time="${current.max_time}" controls preload="metadata"
          controlsList="nodownload noremoteplayback" disablepictureinpicture playsinline
          style="width:100%;max-height:70vh;border-radius:10px;background:#000" src="${videoUrl(current)}"></video>
        <p class="muted small" style="margin-top:.6rem">${t('unicef.no_skip_note')}</p></div>` : ''}
      <h3>${t('unicef.videos_label')}</h3>
      ${m.videos.map((v) => videoRowHtml(m, v, current?.id === v.id))}
      ${m.all_videos_done ? quizHtml(m, qs) : html`<p class="muted small">${t('unicef.finish_videos_note')}</p>`}`;
  }

  async function render(root) {
    const m = openModuleId ? status.find((x) => x.id === openModuleId) : null;
    root.innerHTML = (m ? await moduleDetailHtml(m) : listHtml()).s;
    if (m) wireVideo(root, m);
  }

  function wireVideo(root, m) {
    const video = root.querySelector('#uni-player');
    if (!video) return;
    let maxTime = Number(video.dataset.maxTime) || 0;
    let lastPing = 0;
    let settled = false;

    // Resume where the ambassador left off. readyState may already be >= HAVE_METADATA by the time this
    // runs (a cached video can reach that state before the loadedmetadata listener below gets attached),
    // so check both: once now, and again if the event still fires later.
    const resumeSeek = () => { if (maxTime > 0 && video.duration) video.currentTime = Math.min(maxTime, video.duration - 0.25); };
    if (video.readyState >= 1) resumeSeek();
    video.addEventListener('loadedmetadata', resumeSeek);
    video.addEventListener('seeking', () => { if (video.currentTime > maxTime + 1.5) video.currentTime = maxTime; });
    video.addEventListener('ratechange', () => { if (video.playbackRate > 1.01) video.playbackRate = 1; });

    const bar = () => root.querySelector(`[data-video-bar="${video.dataset.videoId}"]`);
    const ping = async (force) => {
      if (settled) return;
      const now = Date.now();
      if (!force && now - lastPing < PING_MS) return;
      lastPing = now;
      maxTime = Math.max(maxTime, video.currentTime);
      let r;
      try { r = await api.reportVideoProgress(video.dataset.videoId, video.currentTime, video.duration || null); }
      catch { return; }
      maxTime = Math.max(maxTime, r.max_time);
      if (video.duration && bar()) bar().style.width = `${Math.min(100, Math.round((maxTime / video.duration) * 100))}%`;
      if (r.completed) {
        settled = true;
        video.pause();
        toast(t('unicef.video_done'));
        status = await api.myUnicefStatus();
        render(root);
      }
    };
    video.addEventListener('timeupdate', () => ping(false));
    video.addEventListener('pause', () => ping(true));
    video.addEventListener('ended', () => ping(true));
  }

  return {
    html: html`<div id="uni-root"></div>`,
    async mount(root) {
      const box = root.querySelector('#uni-root');
      actions['uni-open'] = (el) => { openModuleId = el.dataset.id; render(box); };
      actions['uni-back'] = () => { openModuleId = null; render(box); };
      forms['uni-quiz'] = async (form) => {
        const btn = form.querySelector('[type=submit]'); setBusy(btn, true, t('common.wait'));
        const answers = {};
        for (const el of form.querySelectorAll('input[type=radio]:checked')) answers[el.name] = [el.value];
        try {
          const r = await api.submitQuiz(openModuleId, answers);
          toast(r.passed ? t('unicef.quiz_passed_toast') : t('unicef.quiz_failed_toast', { score: r.score, total: r.total }), r.passed ? 'ok' : 'bad');
          await api.refreshMe();
          status = await api.myUnicefStatus();
          render(box);
        } catch (e) { toast(errText(e), 'bad'); setBusy(btn, false); }
      };
      await render(box);
    },
  };
}
