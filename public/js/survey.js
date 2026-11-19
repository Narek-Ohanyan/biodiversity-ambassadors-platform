// Feedback survey (required before the certificate) and the "claim your certificate" flow.
// The questions live in SURVEY below, in English and Armenian; answers are stored as { questionId: value } with
// optional "<id>__story" (tell your story) and "<id>__other" texts. The required questions are also enforced in the
// database (submit_survey), so changing which ones are required needs a matching change there.
import { t, getLang } from './i18n.js';
import { html, raw, esc, openModal, toast, errText, setBusy } from './lib.js';
import * as api from './api.js';
import { state } from './api.js';
import { downloadCertificate, armenianDative, latinForFont } from './certificate.js';

const lo = (en, hy) => ({ en, hy });
const RATE = { lo: lo('1 = Very low', '1 = Շատ ցածր'), hi: lo('5 = Very high', '5 = Շատ բարձր') };
const opt = (id, en, hy, extra = {}) => ({ id, t: { en, hy }, ...extra });

export const SURVEY = [
  { id: 'A', title: { en: 'A. Your experience', hy: 'Ա. Ձեր փորձը' }, questions: [
    { id: 'a1', type: 'rating', req: true, q: { en: 'Overall, how satisfied are you with the Biodiversity Ambassadors Program?', hy: 'Ընդհանուր առմամբ որքանո՞վ եք գոհ «Կենսաբազմազանության դեսպաններ» ծրագրից։' },
      lo: lo('1 = Very dissatisfied', '1 = Շատ դժգոհ'), hi: lo('5 = Very satisfied', '5 = Շատ գոհ') },
    { id: 'a2', type: 'matrix', req: true, na: true, q: { en: 'Rate each part of the program (1–5, or “did not take part”).', hy: 'Գնահատեք ծրագրի յուրաքանչյուր մասը (1–5, կամ «չեմ մասնակցել»)։' }, ...RATE,
      items: [opt('platform', 'The learning platform and credit system', 'Ուսումնական հարթակը և կրեդիտների համակարգը'), opt('teams', 'The volunteer teams and schedule', 'Կամավորական թիմերը և ժամանակացույցը'),
        opt('support', 'The support and communication from the program team', 'Ծրագրի թիմի աջակցությունը և հաղորդակցությունը'), opt('cop17', 'Your experience at COP17', 'Ձեր փորձը COP17-ում')] },
    { id: 'a3', type: 'groups', na: true, q: { en: 'Rate the training academy components that you passed (1–5, or “did not take part”).', hy: 'Գնահատեք վերապատրաստման ակադեմիայի այն բաղադրիչները, որոնք անցել եք (1–5, կամ «չեմ մասնակցել»)։' }, ...RATE,
      groups: [
        { title: { en: 'Core — 40 credits', hy: 'Հիմնական — 40 կրեդիտ' }, items: [
          opt('inperson', 'In-Person Introductory Training', 'Առանձին ներածական դասընթաց (դեմ առ դեմ)'), opt('unicef', 'UNICEF Training Modules', 'UNICEF-ի ուսուցողական մոդուլներ'),
          opt('gybn_intl', 'GYBN International Training', 'GYBN միջազգային դասընթաց'), opt('gybn_youth', 'GYBN Youth Workshop', 'GYBN երիտասարդական աշխատաժողով'),
          opt('autumn', 'AUA Acopian Center and WSL FORACCA Autumn School 2026', 'ՀԱՀ Յակոբեան կենտրոնի և WSL FORACCA 2026 թվականի աշնանային դպրոց'), opt('core_other', 'Other:', 'Այլ՝', { other: true })] },
        { title: { en: 'Elective — 10 credits', hy: 'Ընտրովի — 10 կրեդիտ' }, items: [
          opt('bioblitz', 'BioBlitz', 'BioBlitz'), opt('bio4aua', 'Biodiversity4AUA', 'Biodiversity4AUA'), opt('elective_other', 'Other:', 'Այլ՝', { other: true })] },
        { title: { en: 'Soft Skills — 10 credits', hy: 'Փափուկ հմտություններ — 10 կրեդիտ' }, items: [
          opt('comm', 'Communication Course', 'Հաղորդակցության դասընթաց'), opt('digital', 'Digital Communication Course', 'Թվային հաղորդակցության դասընթաց'), opt('soft_other', 'Other:', 'Այլ՝', { other: true })] },
        { title: { en: 'Final Webinar', hy: 'Եզրափակիչ վեբինար' }, items: [opt('webinar', 'Final Webinar', 'Եզրափակիչ վեբինար')] }] },
    { id: 'a4', type: 'text', q: { en: 'What was the most valuable part of the program for you?', hy: 'Ո՞րն էր ծրագրի ամենաարժեքավոր մասը ձեզ համար։' } },
    { id: 'a5', type: 'text', q: { en: 'What should we improve?', hy: 'Ի՞նչ պետք է բարելավենք։' } } ] },
  { id: 'B', title: { en: 'B. Impact', hy: 'Բ. Ազդեցություն' }, questions: [
    { id: 'b5', type: 'rating', req: true, q: { en: 'How much did the program increase your knowledge of biodiversity and COP17?', hy: 'Որքանո՞վ ընդլայնեց ծրագիրը ձեր գիտելիքները կենսաբազմազանության և COP17-ի մասին։' }, lo: lo('1 = Not at all', '1 = Ընդհանրապես ոչ'), hi: lo('5 = A great deal', '5 = Շատ') },
    { id: 'b6', type: 'rating', req: true, q: { en: 'How confident are you now in speaking about biodiversity to others?', hy: 'Որքանո՞վ վստահ եք այժմ խոսել կենսաբազմազանության մասին ուրիշների հետ։' }, lo: lo('1 = Not confident', '1 = Վստահ չեմ'), hi: lo('5 = Very confident', '5 = Շատ վստահ եմ') },
    { id: 'b7', type: 'rating', req: true, na: true, q: { en: 'As a Biodiversity Ambassador, how were you viewed by your friends and family?', hy: 'Որպես Կենսաբազմազանության դեսպան՝ ինչպե՞ս էին ձեզ ընկալում ձեր ընկերներն ու ընտանիքը։' },
      lo: lo('1 = Negatively or with no interest', '1 = Բացասաբար կամ առանց հետաքրքրության'), hi: lo('5 = Very positively and supportively', '5 = Շատ դրական և աջակցող') } ] },
  { id: 'C', title: { en: 'C. Continuation of the program', hy: 'Գ. Ծրագրի շարունակությունը' }, questions: [
    { id: 'c7', type: 'multi', q: { en: 'If the Biodiversity Ambassadors program continues, how would you like to participate in the program?', hy: 'Եթե «Կենսաբազմազանության դեսպաններ» ծրագիրը շարունակվի, ինչպե՞ս կցանկանայիք մասնակցել դրան։' }, options: [
      opt('organize', 'Organizing activities in your community', 'Համայնքում միջոցառումներ կազմակերպելով'), opt('info', 'Receiving information about national and international engagement opportunities', 'Ստանալով տեղեկատվություն ազգային և միջազգային ներգրավման հնարավորությունների մասին'),
      opt('training', 'Accessing specialized training', 'Մասնակցելով մասնագիտացված վերապատրաստումների'), opt('mentoring', 'Mentoring new ambassadors', 'Նոր դեսպաններին մենթորություն անելով')] },
    { id: 'c8', type: 'multi', q: { en: 'Which formats would you prefer?', hy: 'Ո՞ր ձևաչափերն եք նախընտրում։' }, options: [
      opt('online', 'Online courses', 'Առցանց դասընթացներ'), opt('workshops', 'Workshops', 'Աշխատաժողովներ'), opt('field', 'Field activities and BioBlitz', 'Դաշտային միջոցառումներ և BioBlitz'),
      opt('teams', 'Volunteer teams at events', 'Կամավորական թիմեր միջոցառումներում'), opt('mentoring', 'Mentoring', 'Մենթորություն'), opt('network', 'Network', 'Ցանց'), opt('other', 'Other', 'Այլ', { other: true })] },
    { id: 'c9', type: 'text', q: { en: 'How would you like a future edition to differ?', hy: 'Ինչպե՞ս կցանկանայիք, որ ապագա հրատարակությունը տարբերվեր։' } } ] },
  { id: 'D', title: { en: 'D. Future of the ambassador network', hy: 'Դ. Դեսպանների ցանցի ապագան' }, questions: [
    { id: 'd10', type: 'rating', req: true, q: { en: 'How valuable is staying connected with the ambassador network?', hy: 'Որքանո՞վ արժեքավոր է կապի մեջ մնալը դեսպանների ցանցի հետ։' }, lo: lo('1 = Not valuable', '1 = Արժեքավոր չէ'), hi: lo('5 = Very valuable', '5 = Շատ արժեքավոր է') },
    { id: 'd11', type: 'multi', q: { en: 'What should the network do?', hy: 'Ի՞նչ պետք է անի ցանցը։' }, options: [
      opt('share', 'Share opportunities', 'Կիսվի հնարավորություններով'), opt('projects', 'Run joint projects', 'Իրականացնի համատեղ նախագծեր'), opt('meetings', 'Organize regular meetings', 'Կազմակերպի պարբերական հանդիպումներ'),
      opt('training', 'Offer training', 'Առաջարկի վերապատրաստումներ'), opt('advocacy', 'Support national and international advocacy', 'Աջակցի ազգային և միջազգային ջատագովությանը'), opt('other', 'Other:', 'Այլ՝', { other: true })] } ] },
  { id: 'E', title: { en: 'E. Readiness to join', hy: 'Ե. Միանալու պատրաստակամությունը' }, questions: [
    { id: 'e12', type: 'single', req: true, q: { en: 'Are you ready to stay active as a Biodiversity Ambassador after COP17?', hy: 'Պատրա՞ստ եք COP17-ից հետո ակտիվ մնալ որպես Կենսաբազմազանության դեսպան։' }, options: [
      opt('active', 'Yes, actively', 'Այո, ակտիվորեն'), opt('occasionally', 'Yes, occasionally', 'Այո, ժամանակ առ ժամանակ'), opt('unsure', 'Not sure', 'Վստահ չեմ'), opt('no', 'No', 'Ոչ')] },
    { id: 'e13', type: 'text', q: { en: 'How would you like to contribute?', hy: 'Ինչպե՞ս կցանկանայիք ներդրում ունենալ։' } },
    { id: 'e14', type: 'single', req: true, q: { en: 'How many hours per month could you commit?', hy: 'Ամսական քանի՞ ժամ կարող եք տրամադրել։' }, options: [opt('0-2', '0–2', '0–2'), opt('3-5', '3–5', '3–5'), opt('6-10', '6–10', '6–10'), opt('10+', '10+', '10+')] } ] },
  { id: 'F', title: { en: 'Closing', hy: 'Եզրափակում' }, questions: [
    { id: 'f15', type: 'single', q: { en: 'Would you be willing to be contacted for a short focus group discussion (online)?', hy: 'Պատրա՞ստ եք, որ ձեզ հետ կապ հաստատենք կարճ (առցանց) ֆոկուս խմբի քննարկման համար։' }, options: [opt('yes', 'Yes', 'Այո'), opt('no', 'No', 'Ոչ')] },
    { id: 'f16', type: 'text', q: { en: 'Any other comments for the program team?', hy: 'Ունե՞ք այլ մեկնաբանություններ ծրագրի թիմի համար։' } } ] },
];

export const QUESTIONS = SURVEY.flatMap((s) => s.questions);
const tx = (o, lg) => (o ? (o[lg] ?? o.en) : '');

// ── rendering ───────────────────────────────────────────────────────────────
const scale = (name, na, lg) => html`<div class="sv-scale" role="radiogroup">
  ${[1, 2, 3, 4, 5].map((n) => html`<label class="sv-opt"><input type="radio" name="${name}" value="${n}" data-kind="scale"><span>${n}</span></label>`)}
  ${na ? html`<label class="sv-opt na"><input type="radio" name="${name}" value="na" data-kind="scale"><span>${lg === 'hy' ? 'Չեմ մասնակցել' : 'Did not take part'}</span></label>` : ''}</div>`;
const ends = (q, lg) => html`<div class="sv-ends"><span>${tx(q.lo, lg)}</span><span>${tx(q.hi, lg)}</span></div>`;
const story = (id, lg) => html`<details class="sv-story"><summary>＋ ${lg === 'hy' ? 'Պատմեք ձեր պատմությունը (ըստ ցանկության)' : 'Tell your story (optional)'}</summary>
  <textarea name="${id}__story" rows="3" maxlength="1200" placeholder="${lg === 'hy' ? 'Կիսվեք ավելին, մանրամասնեք կամ բերեք օրինակ, եթե ցանկանում եք։' : 'Share more, elaborate or bring an example if you wish.'}"></textarea></details>`;

function questionHtml(q, n, lg) {
  const title = html`<div class="sv-qt"><b>${n}.</b> ${tx(q.q, lg)} ${q.req ? html`<span class="sv-req" aria-label="required">*</span>` : ''}</div>`;
  if (q.type === 'rating') return html`<div class="sv-q" data-q="${q.id}">${title}${scale(q.id, q.na, lg)}${ends(q, lg)}${story(q.id, lg)}</div>`;
  if (q.type === 'matrix') return html`<div class="sv-q" data-q="${q.id}">${title}${ends(q, lg)}
    ${q.items.map((it) => html`<div class="sv-row"><div class="sv-rowt">${tx(it.t, lg)}</div>${scale(`${q.id}.${it.id}`, q.na, lg)}</div>`)}${story(q.id, lg)}</div>`;
  if (q.type === 'groups') return html`<div class="sv-q" data-q="${q.id}">${title}${ends(q, lg)}
    ${q.groups.map((g) => html`<div class="sv-group"><b>${tx(g.title, lg)}</b>
      ${g.items.map((it) => html`<div class="sv-row"><div class="sv-rowt">${tx(it.t, lg)}${it.other ? html` <input type="text" class="sv-inline" name="${q.id}.${it.id}__name" maxlength="80" aria-label="${tx(it.t, lg)}">` : ''}</div>${scale(`${q.id}.${it.id}`, q.na, lg)}</div>`)}</div>`)}${story(q.id, lg)}</div>`;
  if (q.type === 'single') return html`<div class="sv-q" data-q="${q.id}">${title}<div class="sv-choices">
    ${q.options.map((o) => html`<label class="check"><input type="radio" name="${q.id}" value="${o.id}"> <span>${tx(o.t, lg)}</span></label>`)}</div>${story(q.id, lg)}</div>`;
  if (q.type === 'multi') return html`<div class="sv-q" data-q="${q.id}">${title}<div class="sv-choices">
    ${q.options.map((o) => html`<label class="check"><input type="checkbox" name="${q.id}" value="${o.id}"> <span>${tx(o.t, lg)}</span>${o.other ? html` <input type="text" class="sv-inline" name="${q.id}__other" maxlength="120" aria-label="${tx(o.t, lg)}">` : ''}</label>`)}</div>${story(q.id, lg)}</div>`;
  return html`<div class="sv-q" data-q="${q.id}">${title}<textarea name="${q.id}" rows="3" maxlength="1500"></textarea></div>`;
}

function surveyHtml(lg) {
  let n = 0;
  return html`${SURVEY.map((s) => html`<h3 class="sv-sec">${tx(s.title, lg)}</h3>${s.questions.map((q) => questionHtml(q, ++n, lg))}`)}`;
}

// Restore saved answers into freshly rendered inputs (the language switch re-renders the form).
function restore(root, ans) {
  root.querySelectorAll('input[name], textarea[name]').forEach((el) => {
    const name = el.name, [qid, sub] = name.split('.');
    const val = sub !== undefined ? ans[qid]?.[sub] : ans[name];
    if (val === undefined || val === null) return;
    if (el.type === 'radio') el.checked = String(val) === el.value;
    else if (el.type === 'checkbox') el.checked = Array.isArray(val) && val.includes(el.value);
    else el.value = val;
    if (el.closest('details') && el.value) el.closest('details').open = true;
  });
}

function collect(el, ans) {
  const name = el.name; if (!name) return;
  if (el.type === 'checkbox') {
    const cur = new Set(Array.isArray(ans[name]) ? ans[name] : []);
    if (el.checked) cur.add(el.value); else cur.delete(el.value);
    if (cur.size) ans[name] = [...cur]; else delete ans[name];
    return;
  }
  let value = el.value;
  if (el.type === 'radio') { if (!el.checked) return; if (el.dataset.kind === 'scale' && value !== 'na') value = Number(value); }
  else value = value.trim();
  const [qid, sub] = name.split('.');
  if (sub !== undefined) { ans[qid] ||= {}; if (value === '') delete ans[qid][sub]; else ans[qid][sub] = value; }
  else if (value === '') delete ans[name]; else ans[name] = value;
}

const answered = (ans, q) => {
  if (q.type === 'matrix') return q.items.every((it) => ans[q.id]?.[it.id] !== undefined);
  return ans[q.id] !== undefined && ans[q.id] !== '';
};

// Opens the survey; resolves true once it has been submitted.
export function openSurvey() {
  return new Promise((resolve) => {
    let lg = getLang(), done = false;
    const ans = {};
    const m = openModal({
      title: t('sv.title'), wide: true, onClose: () => resolve(done),
      body: html`<div class="banner"><span>ℹ️</span><div><b>${t('sv.required_note')}</b></div></div>
        <div class="row" style="margin-bottom:.8rem"><span class="muted small">${t('sv.language')}:</span>
          <div class="lang" role="group" aria-label="${t('sv.language')}"><button type="button" data-sv-lang="hy">ՀԱՅ</button><button type="button" data-sv-lang="en">EN</button></div></div>
        <div id="sv-root" class="sv"></div><div class="form-msg form-error" id="sv-err" hidden></div>`,
      footer: html`<button class="btn secondary" type="button" data-modal-close>${t('common.cancel')}</button><button class="btn" type="button" id="sv-submit">${t('sv.submit')}</button>`,
    });
    const root = m.el.querySelector('#sv-root'), err = m.el.querySelector('#sv-err');
    const draw = () => {
      root.innerHTML = surveyHtml(lg).s; restore(root, ans);
      m.el.querySelectorAll('[data-sv-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.svLang === lg)));
    };
    draw();
    m.el.addEventListener('change', (e) => collect(e.target, ans));
    m.el.addEventListener('input', (e) => { if (e.target.matches('textarea, input[type=text]')) collect(e.target, ans); });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-sv-lang]'); if (b && b.dataset.svLang !== lg) { lg = b.dataset.svLang; draw(); } });
    m.el.querySelector('#sv-submit').addEventListener('click', async (e) => {
      const btn = e.currentTarget; // event.currentTarget is cleared once we await, so keep the button
      const missing = QUESTIONS.filter((q) => q.req && !answered(ans, q));
      root.querySelectorAll('.sv-q.invalid').forEach((x) => x.classList.remove('invalid'));
      if (missing.length) {
        missing.forEach((q) => root.querySelector(`[data-q="${q.id}"]`)?.classList.add('invalid'));
        err.textContent = t('sv.err_required'); err.hidden = false;
        root.querySelector(`[data-q="${missing[0].id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      err.hidden = true; setBusy(btn, true, t('common.wait'));
      try { await api.submitSurvey(lg, ans); done = true; m.close(); }
      catch (ex) { err.textContent = errText(ex); err.hidden = false; setBusy(btn, false); }
    });
  });
}

// Names for the certificate; resolves true once the certificate has been generated.
export function openNames(current) {
  return new Promise((resolve) => {
    let ok = false;
    const p = state.profile || {};
    const initHy = current?.full_name_hy || [p.first_name_hy || (/[Ա-և]/.test(p.first_name || '') ? p.first_name : ''), p.last_name_hy || (/[Ա-և]/.test(p.last_name || '') ? p.last_name : '')].filter(Boolean).join(' ');
    const initEn = current?.full_name_en || [p.first_name_en || (/[Ա-և]/.test(p.first_name || '') ? '' : p.first_name), p.last_name_en || (/[Ա-և]/.test(p.last_name || '') ? '' : p.last_name)].filter(Boolean).join(' ');
    const m = openModal({
      title: t('cert.names_title'), onClose: () => resolve(ok),
      body: html`<p>${t('cert.names_text')}</p>
        <div class="field"><label for="cn-hy">${t('cert.name_hy')} *</label><input id="cn-hy" type="text" maxlength="40" value="${initHy}" autocomplete="off" required><div class="hint" id="cn-hy-pv"></div></div>
        <div class="field"><label for="cn-en">${t('cert.name_en')} *</label><input id="cn-en" type="text" maxlength="40" value="${initEn}" autocomplete="off" required><div class="hint" id="cn-en-pv"></div></div>
        ${current ? html`<p class="muted small">${t('cert.edits_left', { n: current.edits_left })}</p>` : html`<p class="muted small">${t('cert.edits_note')}</p>`}
        <div class="form-msg form-error" id="cn-err" hidden></div>`,
      footer: html`<button class="btn secondary" type="button" data-modal-close>${t('common.cancel')}</button><button class="btn" type="button" id="cn-go">${t('cert.go')}</button>`,
    });
    const hy = m.el.querySelector('#cn-hy'), en = m.el.querySelector('#cn-en'), err = m.el.querySelector('#cn-err');
    const preview = () => {
      m.el.querySelector('#cn-hy-pv').textContent = hy.value.trim() ? `${t('cert.preview')}: ${armenianDative(hy.value)}` : '';
      m.el.querySelector('#cn-en-pv').textContent = en.value.trim() ? `${t('cert.preview')}: ${latinForFont(en.value).toUpperCase()}` : '';
    };
    hy.addEventListener('input', preview); en.addEventListener('input', preview); preview();
    m.el.querySelector('#cn-go').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const a = hy.value.replace(/\s+/g, ' ').trim(), b = en.value.replace(/\s+/g, ' ').trim();
      const show = (msg) => { err.textContent = msg; err.hidden = false; };
      if (!/^[Ա-և]+([ '’-][Ա-և]+)+$/.test(a)) return show(t('cert.err_hy'));
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+([ '’.-][A-Za-zÀ-ÖØ-öø-ÿ]+)+$/.test(b)) return show(t('cert.err_en'));
      err.hidden = true; setBusy(btn, true, t('cert.generating'));
      try {
        const saved = await api.setCertificateNames(a, b);
        await downloadCertificate({ hy: saved.full_name_hy, en: saved.full_name_en });
        ok = true; toast(t('cert.downloaded')); m.close();
      } catch (ex) { show(ex?.message === 'name_too_long' ? t('cert.too_long') : errText(ex)); setBusy(btn, false); }
    });
  });
}

// The main button: survey first (if not done yet), then the names, then the certificate.
export async function claimCertificate() {
  const st = await api.myCertificate();
  if (!st.eligible) { toast(t('err.not_qualified'), 'bad'); return false; }
  if (!st.survey_done) { if (!(await openSurvey())) return false; toast(t('sv.thanks')); }
  const cur = (await api.myCertificate()).certificate;
  return openNames(cur);
}
