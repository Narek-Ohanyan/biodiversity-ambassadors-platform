import { t, getLang } from './i18n.js';
import { html, raw, esc, safeUrl, initials, actions, forms, openModal, toast, errText, setBusy, debounce, fmtDate, skillLabel, langLabel, profLabel, localName } from './lib.js';
import * as api from './api.js';
import { state, sb } from './api.js';
import { CONTENT } from './content.js';
import { UNIVERSITIES } from './catalog.js';
import { CONTACT_EMAIL, ACE_URL } from './config.js';
import { navigate } from './router.js';

let manifestPromise;
const manifest = () => (manifestPromise ||= fetch('/media/manifest.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
const lang = () => getLang();

export const formMsg = (form, text, type = 'error') => {
  let el = form.querySelector('.form-msg');
  if (!el) { el = document.createElement('div'); el.className = 'form-msg'; form.prepend(el); }
  el.className = `form-msg ${type === 'error' ? 'form-error' : 'form-ok'}`;
  el.textContent = text; el.hidden = !text; el.setAttribute('role', 'alert');
};

// ── Home ────────────────────────────────────────────────────────────────────
const contourSvg = raw(`<svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" fill="none" stroke="#fff" stroke-width="1" aria-hidden="true">
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<path d="M-20 ${60 + i * 34} C 120 ${20 + i * 30}, 220 ${110 + i * 26}, 360 ${70 + i * 32} S 620 ${10 + i * 34}, 830 ${80 + i * 28}"/>`).join('')}
</svg>`);

export async function homeView() {
  const [m, ambassadors] = await Promise.all([manifest(), api.publicAmbassadors().catch(() => [])]);
  const slides = m.carousel || [];
  const cfg = state.config;
  const cats = ['core', 'elective', 'soft'];
  return {
    html: html`
    <section class="hero" aria-roledescription="carousel" aria-label="${t('home.carousel')}">
      ${slides.length
        ? html`<div class="hero-slides">${slides.map((s, i) => html`<img src="${s}" alt="" class="${i === 0 ? 'on' : ''}" ${i === 0 ? '' : raw('loading="lazy"')}>`)}</div>`
        : html`<div class="hero-fallback">${contourSvg}</div>`}
      <div class="container"><div class="hero-content">
        <p class="eyebrow">${t('home.eyebrow')}</p>
        <h1>${t('home.title')}</h1>
        <p class="lead">${t('home.lead')}</p>
        <div class="row" style="margin-top:1.6rem">
          <a class="btn accent lg" href="/platform" data-link>${t('home.cta_join')}</a>
          <a class="btn secondary lg" style="color:#fff;border-color:rgba(255,255,255,.55)" href="/ambassadors" data-link>${t('home.cta_ambassadors')}</a>
        </div>
      </div></div>
      ${slides.length > 1 ? html`<div class="hero-controls">
        <button type="button" data-act="slide-prev" aria-label="${t('home.prev')}">‹</button>
        <div class="dots">${slides.map((_, i) => html`<button type="button" data-act="slide-go" data-i="${i}" class="${i === 0 ? 'on' : ''}" aria-label="${i + 1}"></button>`)}</div>
        <button type="button" data-act="slide-next" aria-label="${t('home.next')}">›</button></div>` : ''}
    </section>
    <div class="container"><div class="stats">
      <div class="stat"><b>~300</b><span>${t('home.stat_students')}</span></div>
      <div class="stat"><b>${t('home.stat_cop_date')}</b><span>${t('home.stat_cop')}</span></div>
      <div class="stat"><b>60</b><span>${t('home.stat_credits')}</span></div>
      <div class="stat"><b>${ambassadors.length}</b><span>${t('home.stat_ambassadors')}</span></div>
    </div></div>
    <section class="section"><div class="container cols-2" style="align-items:center">
      <div><p class="eyebrow">${t('home.about_eyebrow')}</p><h2>${t('home.about_title')}</h2><p>${CONTENT.intro[lang()]}</p>
        <a class="btn secondary" href="/about" data-link>${t('home.read_more')}</a></div>
      <div class="card"><h3>${t('home.deadline_title')}</h3>
        <p class="muted">${t('home.deadline_text')}</p>
        <p style="font:700 2rem var(--font-head);margin:0;color:var(--apricot-dark)">${fmtDate(`${cfg?.displayDeadline || '2026-10-12'}T12:00:00+04:00`, { dateStyle: 'long' })}</p></div>
    </div></section>
    <section class="section tint"><div class="container">
      <div class="section-head"><p class="eyebrow">${t('home.path_eyebrow')}</p><h2>${t('home.path_title')}</h2><p class="muted">${t('home.path_text')}</p></div>
      <div class="cols-3">${cats.map((c) => html`<div class="card credit-card ${c}">
        <div class="big">${cfg?.categories?.[c]?.required ?? ({ core: 40, elective: 10, soft: 10 })[c]}</div>
        <h3>${t(`cat.${c}`)}</h3><p class="muted">${t(`home.cat_${c}`)}</p></div>`)}</div>
      <div class="row" style="margin-top:2rem"><a class="btn" href="/platform" data-link>${t('home.cta_join')}</a><span class="muted small">${t('home.total_note')}</span></div>
    </div></section>`,
    mount(root) { initCarousel(root); },
  };
}

function initCarousel(root) {
  const imgs = [...root.querySelectorAll('.hero-slides img')];
  if (imgs.length < 2) return;
  const dots = [...root.querySelectorAll('.dots button')];
  let i = 0, timer;
  const go = (n) => { i = (n + imgs.length) % imgs.length; imgs.forEach((im, k) => im.classList.toggle('on', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
  const play = () => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go(i + 1), 5500); };
  const stop = () => clearInterval(timer);
  actions['slide-next'] = () => { stop(); go(i + 1); play(); };
  actions['slide-prev'] = () => { stop(); go(i - 1); play(); };
  actions['slide-go'] = (el) => { stop(); go(Number(el.dataset.i)); play(); };
  const hero = root.querySelector('.hero');
  hero.addEventListener('mouseenter', stop); hero.addEventListener('mouseleave', () => { stop(); play(); });
  play();
  const observer = new MutationObserver(() => { if (!document.body.contains(hero)) { stop(); observer.disconnect(); } });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ── About ───────────────────────────────────────────────────────────────────
export async function aboutView() {
  const m = await manifest();
  const L = lang();
  const person = (p) => {
    const src = m.team?.[p.id] || null;
    return html`<article class="card person">
      ${src ? html`<img class="avatar" src="${src}" alt="${p.name[L]}" loading="lazy" data-fallback="${initials(...p.name.en.split(' '))}">` : html`<div class="avatar" aria-hidden="true">${initials(...p.name.en.split(' '))}</div>`}
      <div><h3>${p.name[L]}</h3><p class="role">${p.role[L]}</p>
        <p class="small">${p.bio[L]}</p>
        <a class="btn secondary sm" href="${safeUrl(p.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></div></article>`;
  };
  return {
    html: html`
    <div class="page-title"><div class="container"><p class="eyebrow">${t('about.eyebrow')}</p><h1>${t('nav.about')}</h1></div></div>
    <section class="section"><div class="container narrow" style="margin-inline:auto;width:min(860px,100% - 2rem)">
      <h2>${t('about.program')}</h2><p>${CONTENT.intro[L]}</p></div></section>
    <section class="section tint"><div class="container"><div class="section-head"><h2>${t('about.objectives')}</h2></div>
      <ol class="objectives">${CONTENT.objectives[L].map((o) => html`<li><span>${o}</span></li>`)}</ol></div></section>
    <section class="section"><div class="container cols-2">
      <div><h2>${t('about.aucb')}</h2>${CONTENT.aucb[L].map((p) => html`<p>${p}</p>`)}</div>
      <div><h3>${t('about.members')}</h3><div class="pills">${UNIVERSITIES.map((u) => html`<span class="pill">${u[L]}</span>`)}</div></div>
    </div></section>
    ${m.about?.length ? html`<section class="section tint"><div class="container"><div class="gallery">${m.about.map((s) => html`<img src="${s}" alt="" loading="lazy">`)}</div></div></section>` : ''}
    <section class="section"><div class="container"><div class="section-head"><p class="eyebrow">${t('about.team_eyebrow')}</p><h2>${t('about.team')}</h2></div>
      <div class="team" style="grid-template-columns:1fr">${CONTENT.team.map(person)}</div></div></section>`,
    mount(root) {
      root.querySelectorAll('img[data-fallback]').forEach((img) => img.addEventListener('error', () => {
        const d = document.createElement('div'); d.className = 'avatar'; d.textContent = img.dataset.fallback; img.replaceWith(d);
      }, { once: true }));
    },
  };
}

// ── Platform (sign in / sign up / forgot) ───────────────────────────────────
function authCard(mode) {
  if (state.user && state.account) {
    const dest = state.account.role === 'manager' ? '/manager' : '/app';
    return html`<div class="card"><h2 style="font-size:1.5rem">${t('auth.signed_in_as')}</h2><p class="muted">${state.account.email}</p>
      <div class="row"><a class="btn" href="${dest}" data-link>${t('auth.open_platform')}</a><button class="btn secondary" type="button" data-act="logout">${t('nav.logout')}</button></div></div>`;
  }
  if (mode === 'forgot') {
    return html`<div class="card"><h2 style="font-size:1.5rem">${t('auth.forgot_title')}</h2><p class="muted">${t('auth.forgot_text')}</p>
      <form data-form="forgot" novalidate>
        <div class="field"><label for="f-email">${t('auth.email')}</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
        <button class="btn" type="submit">${t('auth.send_link')}</button>
        <button class="btn ghost" type="button" data-act="auth-tab" data-tab="signin">${t('auth.back_signin')}</button></form></div>`;
  }
  const signin = mode !== 'signup';
  return html`<div class="card">
    <div class="tabs" role="tablist"><button role="tab" type="button" aria-selected="${String(signin)}" data-act="auth-tab" data-tab="signin">${t('auth.signin')}</button>
      <button role="tab" type="button" aria-selected="${String(!signin)}" data-act="auth-tab" data-tab="signup">${t('auth.signup')}</button></div>
    ${signin ? html`<form data-form="login" novalidate>
      <div class="field"><label for="l-email">${t('auth.email')}</label><input id="l-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="l-pw">${t('auth.password')}</label><input id="l-pw" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn" type="submit" style="width:100%">${t('auth.signin')}</button>
      <p class="center" style="margin:1rem 0 0"><button class="link-btn" type="button" data-act="auth-tab" data-tab="forgot">${t('auth.forgot')}</button></p></form>`
    : html`<form data-form="signup" novalidate>
      <div class="field"><label for="s-email">${t('auth.email')}</label><input id="s-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="s-pw">${t('auth.password')}</label><input id="s-pw" name="password" type="password" autocomplete="new-password" minlength="8" required>
        <div class="hint">${t('auth.pw_hint')}</div></div>
      <div class="field"><label for="s-pw2">${t('auth.password2')}</label><input id="s-pw2" name="password2" type="password" autocomplete="new-password" required></div>
      <button class="btn" type="submit" style="width:100%">${t('auth.create_account')}</button>
      <p class="muted small" style="margin:1rem 0 0">${t('auth.privacy_note')}</p></form>`}
  </div>`;
}

export function platformView() {
  const feats = [['👤', 'profile'], ['🔔', 'notifications'], ['🎓', 'learning']];
  return {
    html: html`<div class="platform-page">
    <div class="page-title"><div class="container"><p class="eyebrow">${t('platform.eyebrow')}</p><h1>${t('nav.platform')}</h1></div></div>
    <section class="section"><div class="container auth-wrap">
      <div><h2>${t('platform.title')}</h2><p>${t('platform.text')}</p>
        <ul class="feature-list">${feats.map(([ic, k]) => html`<li><span class="ic" aria-hidden="true">${ic}</span><div><b>${t(`platform.f_${k}`)}</b><div class="muted small">${t(`platform.f_${k}_text`)}</div></div></li>`)}</ul>
        <p class="muted small" style="margin-top:1rem">${t('platform.deadline_note', { date: fmtDate(`${state.config?.displayDeadline || '2026-10-12'}T12:00:00+04:00`, { dateStyle: 'long' }) })}</p></div>
      <div id="authcard">${authCard('signin')}</div>
    </div></section></div>`,
    mount(root) {
      const slot = () => root.querySelector('#authcard');
      actions['auth-tab'] = (el) => { slot().innerHTML = authCard(el.dataset.tab).s; slot().querySelector('input')?.focus(); };
    },
  };
}

forms.login = async (form) => {
  const btn = form.querySelector('[type=submit]');
  const { email, password } = Object.fromEntries(new FormData(form));
  if (!email || !password) return formMsg(form, t('err.required'));
  setBusy(btn, true, t('common.wait'));
  try {
    await api.signIn(email.trim(), password);
    await api.loadUser();
    api.recordLogin();
    afterLogin();
  } catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
};

export function afterLogin() {
  if (state.account?.role === 'manager') return navigate('/manager');
  return navigate(state.profile?.completed ? '/app/learning' : '/app/profile');
}

forms.signup = async (form) => {
  const btn = form.querySelector('[type=submit]');
  const { email, password, password2 } = Object.fromEntries(new FormData(form));
  if (!email || !password) return formMsg(form, t('err.required'));
  if (password.length < 8) return formMsg(form, t('err.weak_password'));
  if (password !== password2) return formMsg(form, t('err.password_mismatch'));
  setBusy(btn, true, t('common.wait'));
  try {
    const data = await api.signUp(email.trim(), password);
    if (data.session) { await api.loadUser(); api.recordLogin(); return afterLogin(); }
    // Supabase hides whether an address is already registered: an empty identities list means it is.
    if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('already registered');
    form.innerHTML = html`<div class="form-ok" role="status"><b>${t('auth.check_email_title')}</b><br>${t('auth.check_email_text', { email: email.trim() })}</div>`.s;
  } catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
};

forms.forgot = async (form) => {
  const btn = form.querySelector('[type=submit]');
  const email = new FormData(form).get('email')?.trim();
  if (!email) return formMsg(form, t('err.required'));
  setBusy(btn, true, t('common.wait'));
  try { await api.sendReset(email); formMsg(form, t('auth.reset_sent'), 'ok'); }
  catch (e) { formMsg(form, errText(e)); }
  setBusy(btn, false);
};

// Password reset (arrives from the e-mailed link; supabase-js turns the URL hash into a recovery session).
export function resetView() {
  return {
    html: html`<div class="page-title"><div class="container"><h1>${t('auth.reset_title')}</h1></div></div>
    <section class="section"><div class="container narrow"><div class="card" id="resetcard"><div class="loading"><span class="spinner"></span></div></div></div></section>`,
    async mount(root) {
      const card = root.querySelector('#resetcard');
      let session = (await sb.auth.getSession()).data.session;
      for (let i = 0; !session && i < 8; i++) { await new Promise((r) => setTimeout(r, 250)); session = (await sb.auth.getSession()).data.session; }
      if (!session) { card.innerHTML = html`<div class="form-error">${t('auth.reset_invalid')}</div><a class="btn" href="/platform" data-link>${t('auth.back_signin')}</a>`.s; return; }
      card.innerHTML = html`<form data-form="reset" novalidate>
        <div class="field"><label for="r-pw">${t('auth.new_password')}</label><input id="r-pw" name="password" type="password" autocomplete="new-password" minlength="8" required><div class="hint">${t('auth.pw_hint')}</div></div>
        <div class="field"><label for="r-pw2">${t('auth.password2')}</label><input id="r-pw2" name="password2" type="password" autocomplete="new-password" required></div>
        <button class="btn" type="submit">${t('auth.save_password')}</button></form>`.s;
    },
  };
}
forms.reset = async (form) => {
  const btn = form.querySelector('[type=submit]');
  const { password, password2 } = Object.fromEntries(new FormData(form));
  if (!password || password.length < 8) return formMsg(form, t('err.weak_password'));
  if (password !== password2) return formMsg(form, t('err.password_mismatch'));
  setBusy(btn, true, t('common.wait'));
  try { await api.setPassword(password); await api.loadUser(); toast(t('auth.password_changed')); afterLogin(); }
  catch (e) { formMsg(form, errText(e)); setBusy(btn, false); }
};

// ── Ambassadors ─────────────────────────────────────────────────────────────
export function ambassadorBody(a, { showEmail = true } = {}) {
  const L = lang();
  const social = Object.entries(a.social || {}).filter(([, v]) => v);
  return html`<div class="row" style="align-items:flex-start;gap:1.2rem;flex-wrap:nowrap">
      ${a.photo_path ? html`<img class="avatar" style="width:120px;flex:none" src="${api.photoUrl(a.photo_path)}" alt="">` : html`<div class="avatar" style="width:120px;flex:none">${initials(a.first_name, a.last_name)}</div>`}
      <div><h3 style="margin-bottom:.1rem">${a.first_name} ${a.last_name}</h3><div>${localUniversity(a.university)}</div><div class="muted">${a.faculty}</div></div></div>
    <p style="margin-top:1rem;white-space:pre-line">${a.bio}</p>
    ${a.skills?.length ? html`<h4>${t('profile.skills')}</h4><div class="chips" style="margin-bottom:1rem">${a.skills.map((s) => html`<span class="chip">${skillLabel(s)}</span>`)}</div>` : ''}
    ${a.languages?.length ? html`<h4>${t('profile.languages')}</h4><div class="chips" style="margin-bottom:1rem">${a.languages.map((l) => html`<span class="chip info">${langLabel(l)} · ${profLabel(l.level)}</span>`)}</div>` : ''}
    ${(social.length || (showEmail && a.public_email)) ? html`<div class="row">${social.map(([k, v]) => html`<a class="btn secondary sm" href="${safeUrl(v)}" target="_blank" rel="noopener noreferrer">${t(`social.${k}`)} ↗</a>`)}
      ${showEmail && a.public_email ? html`<a class="btn secondary sm" href="mailto:${a.public_email}">✉ ${a.public_email}</a>` : ''}</div>` : ''}`;
}
export const localUniversity = (u) => { const f = UNIVERSITIES.find((x) => x.key === u); return f ? f[lang()] : u; };

export async function ambassadorsView() {
  let list = [];
  let failed = false;
  try { list = await api.publicAmbassadors(); } catch { failed = true; }
  const unis = [...new Set(list.map((a) => a.university))].sort();
  const grid = (items) => (items.length
    ? html`<div class="amb-grid">${items.map((a) => html`<button type="button" class="amb-card" data-act="amb-open" data-id="${a.id}">
        ${a.photo_path ? html`<img class="photo" src="${api.photoUrl(a.photo_path)}" alt="" loading="lazy">` : html`<div class="photo avatar" style="border-radius:0">${initials(a.first_name, a.last_name)}</div>`}
        <div class="body"><h3>${a.first_name} ${a.last_name}</h3><div class="small">${localUniversity(a.university)}</div><div class="small muted">${a.faculty}</div></div></button>`)}</div>`
    : html`<div class="empty"><p style="font:700 1.3rem var(--font-head);color:var(--forest-900)">${failed ? t('err.generic') : t('amb.empty_title')}</p><p>${t('amb.empty_text')}</p><a class="btn" href="/platform" data-link>${t('home.cta_join')}</a></div>`);
  return {
    html: html`<div class="page-title"><div class="container"><p class="eyebrow">${t('amb.eyebrow')}</p><h1>${t('nav.ambassadors')}</h1>
      <p class="muted" style="max-width:640px;margin:.6rem 0 0">${t('amb.lead')}</p></div></div>
    <section class="section"><div class="container">
      ${list.length ? html`<div class="toolbar"><input type="search" id="amb-q" placeholder="${t('amb.search')}" aria-label="${t('amb.search')}">
        <select id="amb-uni" aria-label="${t('profile.university')}"><option value="">${t('amb.all_universities')}</option>${unis.map((u) => html`<option value="${u}">${localUniversity(u)}</option>`)}</select>
        <span class="muted small">${t('amb.count', { n: list.length })}</span></div>` : ''}
      <div id="amb-grid">${grid(list)}</div></div></section>`,
    mount(root) {
      const q = root.querySelector('#amb-q'), uni = root.querySelector('#amb-uni'), out = root.querySelector('#amb-grid');
      const apply = () => {
        const s = (q?.value || '').toLowerCase().trim();
        out.innerHTML = grid(list.filter((a) => (!uni?.value || a.university === uni.value)
          && (!s || `${a.first_name} ${a.last_name} ${a.faculty} ${a.university}`.toLowerCase().includes(s)))).s;
      };
      q?.addEventListener('input', debounce(apply, 150)); uni?.addEventListener('change', apply);
      actions['amb-open'] = (el) => {
        const a = list.find((x) => x.id === el.dataset.id);
        if (a) openModal({ title: `${a.first_name} ${a.last_name}`, body: ambassadorBody(a), wide: true });
      };
    },
  };
}

// ── Contact ─────────────────────────────────────────────────────────────────
export function contactView() {
  return {
    html: html`<div class="page-title"><div class="container"><p class="eyebrow">${t('contact.eyebrow')}</p><h1>${t('nav.contact')}</h1></div></div>
    <section class="section"><div class="container cols-2">
      <div><h2>${t('contact.title')}</h2><p>${t('contact.text')}</p>
        <div class="card flat" style="margin-bottom:1rem"><div class="small muted">${t('contact.email_label')}</div>
          <a href="mailto:${CONTACT_EMAIL}" style="font:700 1.4rem var(--font-head)">${CONTACT_EMAIL}</a></div>
        <a class="btn secondary" href="${ACE_URL}" target="_blank" rel="noopener noreferrer">${t('contact.ace')} ↗</a></div>
      <div class="card"><h3>${t('contact.form_title')}</h3>
        <form data-form="contact" novalidate>
          <div class="grid-2"><div class="field"><label for="c-name">${t('contact.name')}</label><input id="c-name" name="name" type="text" maxlength="120" autocomplete="name" required></div>
          <div class="field"><label for="c-email">${t('auth.email')}</label><input id="c-email" name="email" type="email" autocomplete="email" maxlength="200" required></div></div>
          <div class="field"><label for="c-sub">${t('contact.subject')}</label><input id="c-sub" name="subject" type="text" maxlength="200"></div>
          <div class="field"><label for="c-msg">${t('contact.message')}</label><textarea id="c-msg" name="message" maxlength="5000" required></textarea></div>
          <button class="btn" type="submit">${t('contact.send')}</button></form></div>
    </div></section>`,
  };
}
forms.contact = async (form) => {
  const btn = form.querySelector('[type=submit]');
  const v = Object.fromEntries(new FormData(form));
  if (!v.name?.trim() || !v.email?.trim() || !v.message?.trim()) return formMsg(form, t('err.required'));
  setBusy(btn, true, t('common.wait'));
  try { await api.submitContact(v); form.reset(); formMsg(form, t('contact.sent'), 'ok'); }
  catch (e) { formMsg(form, errText(e)); }
  setBusy(btn, false);
};

actions.logout = async () => { await api.signOut(); await api.loadUser(); navigate('/'); };
