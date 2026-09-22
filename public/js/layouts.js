import { t, getLang } from './i18n.js';
import { html, raw } from './lib.js';
import { state } from './api.js';
import { CONTACT_EMAIL, ACE_URL, BRAND_NAME, BRAND_SUB } from './config.js';

const logo = html`<img class="brand-mark" src="/media/logo-icon.png" alt="" width="34" height="34">`;

// The brand name is a proper noun, so it is never translated — only the surrounding UI switches language.
const brand = (href) => html`<a class="brand" href="${href}" data-link>${logo}<span>${BRAND_NAME}<small>${BRAND_SUB}</small></span></a>`;
const langSwitch = () => html`<div class="lang" role="group" aria-label="Language">
  <button type="button" data-act="set-lang" data-lang="hy" aria-pressed="${String(getLang() === 'hy')}">ՀԱՅ</button>
  <button type="button" data-act="set-lang" data-lang="en" aria-pressed="${String(getLang() === 'en')}">EN</button></div>`;

export function publicShell(content, path) {
  const link = (href, key) => html`<a href="${href}" data-link class="${path === href ? 'active' : ''}" ${path === href ? raw('aria-current="page"') : ''}>${t(key)}</a>`;
  const dest = state.account?.role === 'manager' ? '/manager' : '/app';
  return html`<header class="site-header"><div class="container inner">
      ${brand('/')}
      <nav class="nav" id="main-nav" aria-label="Main">${link('/', 'nav.home')}${link('/about', 'nav.about')}${link('/platform', 'nav.platform')}${link('/ambassadors', 'nav.ambassadors')}
        <a href="${ACE_URL}" target="_blank" rel="noopener noreferrer">${t('nav.ace')} ↗</a>${link('/contact', 'nav.contact')}</nav>
      <div class="header-actions">${langSwitch()}
        ${state.user ? html`<a class="btn sm" href="${dest}" data-link>${t('nav.dashboard')}</a>` : html`<a class="btn sm hide-sm" href="/platform" data-link>${t('auth.signin')}</a>`}
        <button class="icon-btn menu-toggle" type="button" data-act="menu-toggle" aria-label="Menu" aria-controls="main-nav" aria-expanded="false">☰</button></div></div></header>
    <main id="main">${content}</main>
    <footer class="site-footer"><div class="container footer-grid">
      <div><div class="brand" style="color:#fff">${logo}<span>${BRAND_NAME}<small style="color:#9ab8a9">${BRAND_SUB}</small></span></div>
        <p style="margin-top:1rem;max-width:380px">${t('footer.blurb')}</p></div>
      <div><h4>${t('footer.explore')}</h4><ul><li><a href="/about" data-link>${t('nav.about')}</a></li><li><a href="/platform" data-link>${t('nav.platform')}</a></li><li><a href="/ambassadors" data-link>${t('nav.ambassadors')}</a></li></ul></div>
      <div><h4>${t('nav.contact')}</h4><ul><li><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></li><li><a href="${ACE_URL}" target="_blank" rel="noopener noreferrer">${t('nav.ace')} ↗</a></li></ul></div>
    </div></footer>`;
}

const sideLink = (href, icon, label, path, badge) => html`<a href="${href}" data-link class="${path === href || (href !== '/manager' && path.startsWith(`${href}/`)) ? 'active' : ''}">
  <span aria-hidden="true">${icon}</span><span>${label}</span>${badge ? html`<span class="badge" data-badge="${badge}" hidden></span>` : ''}</a>`;

function shell(navHtml, content, homeHref) {
  return html`<div class="shell">
    <aside class="sidebar" id="sidebar">${brand(homeHref)}
      <nav class="side-nav" aria-label="Platform">${navHtml}</nav>
      <div class="side-foot"><div class="who">${state.account?.email}</div>${langSwitch()}
        <a class="btn secondary sm" href="/" data-link>← ${t('nav.website')}</a>
        <button class="btn secondary sm" type="button" data-act="logout">${t('nav.logout')}</button></div></aside>
    <div><div class="mobile-bar"><button class="icon-btn" type="button" data-act="sidebar-toggle" aria-label="Menu">☰</button><b>${BRAND_NAME}</b></div>
      <main class="main" id="main">${content}</main></div></div>`;
}

export function ambassadorShell(content, path) {
  return shell(html`${sideLink('/app/profile', '👤', t('nav.profile'), path)}${sideLink('/app/notifications', '🔔', t('nav.notifications'), path, 'notifications')}${sideLink('/app/learning', '🎓', t('nav.learning'), path)}`, content, '/app');
}

export function managerShell(content, path) {
  return shell(html`${sideLink('/manager', '📊', t('mgr.overview'), path)}${sideLink('/manager/ambassadors', '👥', t('mgr.ambassadors'), path)}
    ${sideLink('/manager/claims', '✅', t('mgr.claims'), path, 'claims')}${sideLink('/manager/checkins', '📋', t('mgr.checkins'), path)}
    ${sideLink('/manager/messages', '📣', t('mgr.messages'), path)}${sideLink('/manager/inbox', '✉️', t('mgr.inbox'), path, 'inbox')}
    ${sideLink('/manager/notifications', '🔔', t('nav.notifications'), path, 'notifications')}${sideLink('/manager/account', '⚙️', t('mgr.account'), path)}`, content, '/manager');
}
