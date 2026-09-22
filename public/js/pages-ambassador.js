// Ambassador platform: My Profile, My Learning (credit framework + claim flows), UNICEF modules.
import { t, getLang } from './i18n.js';
import { html, raw, esc, actions, forms, openModal, toast, errText, setBusy, wordCount, localName, fmtDate, safeUrl, resizeImage, initials, skillLabel, langLabel, profLabel } from './lib.js';
import * as api from './api.js';
import { state, isLocked } from './api.js';
import { SKILLS, LANGUAGES, PROFICIENCY, UNIVERSITIES } from './catalog.js';
import { navigate } from './router.js';
import { formMsg, localUniversity } from './pages-public.js';

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
          <div class="avatar" id="photo-preview">${p.photo_path ? html`<img src="${api.photoUrl(p.photo_path)}" alt="" style="width:100%;height:100%;object-fit:cover">` : initials(p.first_name, p.last_name)}</div>
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

export async function learningView() {
  await api.refreshMe();
  const cfg = state.config;
  const [claims, unicef, modules] = await Promise.all([api.myClaims(), api.myUnicef(), api.loadModules()]);
  const progress = state.progress;
  const locked = isLocked();
  const ctx = { claims, progress, locked, unicefDone: unicef.length, unicefTotal: modules.length };
  const pct = Math.round((progress.total / progress.required) * 100);
  const cats = ['core', 'elective', 'soft'];
  return {
    html: html`<div class="main-head"><h1>${t('nav.learning')}</h1></div>
    ${locked ? html`<div class="banner bad"><span>🔒</span><div>${t('learn.closed_banner')}</div></div>`
      : html`<div class="banner"><span>⏰</span><div>${t('learn.deadline_banner', { date: fmtDate(`${cfg.displayDeadline}T12:00:00+04:00`, { dateStyle: 'long' }) })}</div></div>`}
    ${progress.qualified ? html`<div class="banner ok"><span>🎉</span><div><b>${t('learn.qualified')}</b> ${t('learn.qualified_text')}</div></div>` : ''}
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
        ${cfg.activities.filter((a) => a.category === c).map((a) => activityRow(a, ctx))}</section>`; })}`,
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

// ── UNICEF modules ──────────────────────────────────────────────────────────
export async function unicefView() {
  await api.refreshMe();
  const [modules, doneRows, claims] = await Promise.all([api.loadModules(), api.myUnicef(), api.myClaims()]);
  const done = new Set(doneRows.map((r) => r.module_id));
  const claim = claims.find((c) => c.activity_key === 'unicef' && (c.status === 'pending' || c.status === 'approved'));
  const cat = state.progress.categories.core;
  const locked = isLocked();
  const blockedNew = locked || (!claim && cat.full);
  const pct = modules.length ? Math.round((done.size / modules.length) * 100) : 0;
  const L = getLang();
  return {
    html: html`<div class="main-head"><div><a class="small" href="/app/learning" data-link>← ${t('nav.learning')}</a><h1>${t('unicef.title')}</h1></div></div>
    <p class="muted" style="max-width:720px">${t('unicef.intro')}</p>
    ${claim ? html`<div class="banner ok"><span>🎉</span><div>${t('unicef.completed', { credits: claim.credits })}</div></div>`
      : locked ? html`<div class="banner bad"><span>🔒</span><div>${t('learn.closed_banner')}</div></div>`
      : cat.full ? html`<div class="banner"><span>ℹ️</span><div>${cat.complete ? t('learn.cat_closed') : t('learn.cat_full')}</div></div>` : ''}
    <div class="card" style="margin-bottom:1.2rem"><div class="row"><b>${t('unicef.progress')}</b><span class="muted">${done.size} / ${modules.length}</span><div class="grow"></div><span class="chip credits">20 ${t('learn.credits')}</span></div>
      <div class="bar core" style="margin-top:.6rem"><i style="width:${pct}%"></i></div></div>
    ${modules.map((m, i) => html`<div class="module ${done.has(m.id) ? 'done' : ''}">
      <div class="num">${done.has(m.id) ? '✓' : i + 1}</div>
      <div><h3 style="margin:0;font-family:var(--font-body);font-size:1.02rem">${m[`title_${L}`]}</h3><div class="muted small">${m[`desc_${L}`] || ''}</div></div>
      <div class="row">${m.url ? html`<a class="btn secondary sm" href="${safeUrl(m.url)}" target="_blank" rel="noopener noreferrer">${t('unicef.open')} ↗</a>` : ''}
        ${claim ? '' : done.has(m.id)
          ? html`<button class="btn ghost sm" type="button" data-act="unicef-toggle" data-id="${m.id}" data-done="0" ${locked ? raw('disabled') : ''}>${t('unicef.undo')}</button>`
          : html`<button class="btn sm" type="button" data-act="unicef-toggle" data-id="${m.id}" data-done="1" ${blockedNew ? raw('disabled') : ''}>${t('unicef.mark')}</button>`}</div></div>`)}
    <p class="muted small">${t('unicef.note')}</p>`,
    mount() {
      actions['unicef-toggle'] = async (el) => {
        el.disabled = true;
        try {
          const r = await api.setUnicef(el.dataset.id, el.dataset.done === '1');
          if (r.done >= r.total && el.dataset.done === '1') toast(t('unicef.awarded'));
          await api.refreshMe(); navigate(location.pathname);
        } catch (e) { toast(errText(e), 'bad'); el.disabled = false; }
      };
    },
  };
}
