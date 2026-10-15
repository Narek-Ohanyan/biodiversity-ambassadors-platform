// Letters of standing (Տեղեկանք): builds the PDF in the browser from a stored record (table standing_letters), laid
// out like the signed Armenian and English templates (logos, justified body text, both signatures).
// Libraries (pdf-lib + fontkit), fonts and images are loaded on first use. Fonts: Liberation Sans (Arial-compatible,
// Latin) and Noto Sans Armenian, both SIL OFL.
export const serialText = (serial) => String(serial).padStart(3, '0');
export const letterNumber = (rec, lang) => `${lang === 'hy' ? 'ԿՀԲԿ-ԿԴ' : 'AUCB-BA'}${serialText(rec.serial)}`;

const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('letter_assets')); document.head.appendChild(s); });
const bytes = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('letter_assets'); return new Uint8Array(await r.arrayBuffer()); };

const ASSETS = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'NotoArmR.ttf', 'NotoArmB.ttf',
  'logo-aucb-butterfly.png', 'logo-aucb-text.png', 'logo-gybn.png', 'sign-amirkhanian.png', 'sign-hovhannisyan.png'];
let assetsPromise;
function loadAssets() {
  return (assetsPromise ||= (async () => {
    if (!window.PDFLib) await loadScript('/vendor/pdf-lib.min.js');
    if (!window.fontkit) await loadScript('/vendor/fontkit.umd.min.js');
    const files = await Promise.all(ASSETS.map((f) => bytes(`/letters/${f}`)));
    return Object.fromEntries(ASSETS.map((f, i) => [f, files[i]]));
  })().catch((e) => { assetsPromise = null; throw e; }));
}

const ARM = /[Ա-֏ﬓ-ﬗ]/;
const HY_MONTHS = ['հունվարի', 'փետրվարի', 'մարտի', 'ապրիլի', 'մայիսի', 'հունիսի', 'հուլիսի', 'օգոստոսի', 'սեպտեմբերի', 'հոկտեմբերի', 'նոյեմբերի', 'դեկտեմբերի'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BLUE = [0x20 / 255, 0x40 / 255, 0x97 / 255];
const LINK = [0x11 / 255, 0x55 / 255, 0xcc / 255];
const EMAIL = /^[\w.+-]+@[\w.-]+\.\w+[.:,;]?$/;
const PAGE_H = 792;

// Date parts in Yerevan time (the letter is dated the day it was issued).
function issueDate(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Yerevan' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { d: Number(parts.day), m: Number(parts.month), y: Number(parts.year) };
}
const dmy = (isoDate) => { const [y, m, d] = String(isoDate).slice(0, 10).split('-'); return `${d}.${m}.${y}`; };

// Armenian definite article: -ն after a vowel, -ը after a consonant.
const hyArticle = (name) => (/(ու|[աեէըիոօ])$/i.test(name.trim()) ? 'ն' : 'ը');

async function newDoc() {
  const a = await loadAssets();
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(window.fontkit);
  const emb = (f) => doc.embedFont(a[f], { subset: true });
  const [lr, lb, ar, ab] = await Promise.all([emb('LiberationSans-Regular.ttf'), emb('LiberationSans-Bold.ttf'), emb('NotoArmR.ttf'), emb('NotoArmB.ttf')]);
  const img = (f) => doc.embedPng(a[f]);
  const [butterfly, wordmark, gybn, sig1, sig2] = await Promise.all(['logo-aucb-butterfly.png', 'logo-aucb-text.png', 'logo-gybn.png', 'sign-amirkhanian.png', 'sign-hovhannisyan.png'].map(img));
  return { doc, fonts: { lat: { r: lr, b: lb }, arm: { r: ar, b: ab } }, img: { butterfly, wordmark, gybn, sig1, sig2 } };
}

// A page "pen": text in mixed Latin/Armenian runs, justified paragraphs, centred and right-aligned lines.
function pen(page, fonts) {
  const { rgb } = window.PDFLib;
  const clean = (text) => String(text ?? '').replace(/[​ ]/g, ' ').replace(/[\r\n\t]+/g, ' ');
  const fontFor = (ch, bold) => (ARM.test(ch) ? fonts.arm : fonts.lat)[bold ? 'b' : 'r'];
  const has = (font, ch) => { try { return font.getCharacterSet().includes(ch.codePointAt(0)); } catch { return true; } };
  function runsOf(text, bold) {
    const out = [];
    for (const raw of clean(text)) {
      let font = fontFor(raw, bold);
      let ch = raw;
      if (!has(font, ch)) { ch = '?'; font = fonts.lat[bold ? 'b' : 'r']; }
      const last = out[out.length - 1];
      if (last && last.font === font) last.text += ch; else out.push({ text: ch, font });
    }
    return out;
  }
  const width = (text, size, bold) => runsOf(text, bold).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
  const draw = (text, x, baseline, size, { bold = false, color = [0, 0, 0] } = {}) => {
    let cx = x;
    for (const r of runsOf(text, bold)) {
      page.drawText(r.text, { x: cx, y: PAGE_H - baseline, size, font: r.font, color: rgb(...color) });
      cx += r.font.widthOfTextAtSize(r.text, size);
    }
    return cx - x;
  };
  const underline = (x, baseline, w, color) => page.drawLine({ start: { x, y: PAGE_H - baseline - 1.4 }, end: { x: x + w, y: PAGE_H - baseline - 1.4 }, thickness: 0.5, color: rgb(...color) });
  const word = (w, x, baseline, size, bold) => {
    if (EMAIL.test(w)) { const wd = draw(w, x, baseline, size, { bold, color: LINK }); underline(x, baseline, wd, LINK); return wd; }
    return draw(w, x, baseline, size, { bold });
  };
  return {
    width, draw,
    centered(text, baseline, size, opts = {}) { draw(text, 306 - width(text, size, opts.bold) / 2, baseline, size, opts); },
    right(text, rightX, baseline, size, opts = {}) { draw(text, rightX - width(text, size, opts.bold), baseline, size, opts); },
    line(text, x, baseline, size, opts = {}) { text.split(/\s+/).reduce((cx, w, i, a) => { const wd = word(w, cx, baseline, size, opts.bold); return cx + wd + (i < a.length - 1 ? width(' ', size, opts.bold) : 0); }, x); },
    // greedy line breaking, justified except the last line; returns the baseline of the last line
    paragraph(text, { x = 72, w = 468, baseline, size, pitch, bold = false }) {
      const words = clean(text).split(/\s+/).filter(Boolean);
      const space = width(' ', size, bold);
      const lines = []; let cur = [], curW = 0;
      for (const wd of words) {
        const ww = width(wd, size, bold);
        if (cur.length && curW + space + ww > w) { lines.push({ cur, curW }); cur = [wd]; curW = ww; } else { curW += (cur.length ? space : 0) + ww; cur.push(wd); }
      }
      if (cur.length) lines.push({ cur, curW, last: true });
      lines.forEach((ln, i) => {
        const y = baseline + i * pitch;
        const gap = !ln.last && ln.cur.length > 1 ? (w - (ln.curW - space * (ln.cur.length - 1))) / (ln.cur.length - 1) : space;
        let cx = x;
        ln.cur.forEach((wd) => { cx += word(wd, cx, y, size, bold) + gap; });
      });
      return baseline + (lines.length - 1) * pitch;
    },
  };
}

function header(page, doc, im, pos) {
  page.drawImage(im.butterfly, { x: 55.5, y: PAGE_H - 12.75 - 87, width: 87, height: 87 });
  page.drawImage(im.wordmark, { x: 138.75, y: PAGE_H - 5.61 - 101.6, width: 180.7, height: 101.6 });
  page.drawImage(im.gybn, { x: pos.gybnX, y: PAGE_H - 16.5 - 79.5, width: 157.5, height: 79.5 });
}

function sigImages(page, im, top, s) {
  page.drawImage(im.sig1, { x: 77.2, y: PAGE_H - top - s.h1, width: s.w1, height: s.h1 });
  page.drawImage(im.sig2, { x: 342, y: PAGE_H - top - s.h2, width: s.w2, height: s.h2 });
}

function signers(p, lines, x, baseline, size, pitch) {
  lines.forEach((t, i) => p.line(t, x, baseline + i * pitch, size, { bold: false }));
}

function armenianPage(ctx, rec) {
  const { doc, fonts, img } = ctx;
  const page = doc.addPage([612, PAGE_H]);
  const p = pen(page, fonts);
  const S = 10.5, PITCH = 17.25;
  header(page, doc, img, { gybnX: 397.5 });
  p.centered('Կենսաբանության հարցերով հայկական բուհերի կոալիցիայի (ԿՀԲԿ)', 132.5, 11, { bold: true, color: BLUE });
  p.centered('«Կենսաբազմազանության դեսպաններ» ծրագիր', 149.7, 11, { bold: true, color: BLUE });
  const dt = issueDate(rec.created_at);
  p.draw(`${dt.d} ${HY_MONTHS[dt.m - 1]}, ${dt.y} թ.`, 72, 193.4, S);
  p.right('ք. Երևան', 540, 193.4, S);
  p.centered(`ՏԵՂԵԿԱՆՔ №${letterNumber(rec, 'hy')}`, 233.1, 11, { bold: true });
  const full = `${rec.first_name_hy} ${rec.patronymic_hy} ${rec.last_name_hy}`;
  const p1 = `Տրվում է առ այն, որ ${full}${hyArticle(full)} (անձնագիր՝ ${rec.passport_number}, տրված՝ ${dmy(rec.passport_issued_on)}թ. ${rec.passport_issued_by}-ի կողմից) հանդիսանում է Կենսաբազմազանության հարցերով հայկական բուհերի կոալիցիայի (ԿՀԲԿ) կողմից իրականացվող «Կենսաբազմազանության դեսպաններ» ծրագրի մասնակից: Վերջինս 2026 թվականի հոկտեմբերի 19-ից 30-ը, ինչպես նաև, անհրաժեշտության դեպքում, դրան նախորդող կամ հաջորդող օրերին, ներգրավված է լինելու Երևանում անցկացվելիք ՄԱԿ-ի «Կենսաբանական բազմազանության մասին» կոնվենցիայի Կողմերի 17-րդ համաժողովի (CBD COP17) նախապատրաստական և բուն միջոցառումներին։`;
  const p2 = 'Ծրագրի շրջանակում նրա գործունեությունը ներառում է աջակցություն միջոցառումների կազմակերպմանը, միջազգային պատվիրակությունների և այցելուների ուղղորդում, տեղեկատվական և հանրային իրազեկման աշխատանքների իրականացում, ինչպես նաև ծրագրով նախատեսված այլ համապատասխան գործառույթներ։';
  let y = p.paragraph(p1, { baseline: 259.5, size: S, pitch: PITCH });
  y = p.paragraph(p2, { baseline: y + 29.2, size: S, pitch: PITCH });
  y = p.paragraph('Տեղեկանքը տրվում է` ներկայացնելու ըստ պահանջի:', { baseline: y + 29.2, size: S, pitch: PITCH });
  y = p.paragraph('Հարցերի դեպքում կարող եք կապ հաստատել ace@aua.am էլ. Հասցեով:', { baseline: y + 34.6, size: S, pitch: PITCH });
  y += 51.7;
  p.line('Հարգանքով`', 72, y, S);
  sigImages(page, img, y + 7.5, { w1: 94.2, h1: 50, w2: 97, h2: 50 });
  const sy = y + 56.8;
  signers(p, ['Ալեն Ամիրխանյան', 'ՀԱՀ Յակոբեան բնապահպանական', 'կենտրոնի տնօրեն,', 'Հայաստանի ամերիկյան համալսարան', 'Մարշալ Բաղրամյան 40, Երևան 0019', 'alen@aua.am'], 77.2, sy, 10, 14);
  signers(p, ['Միքայել Հովհաննիսյան', 'Միջազգային կապերի, զարգացման և', 'նորարարությունների գծով պրոռեկտոր,', 'Երևանի պետական համալսարան', '0025, Երևան, Ալեք Մանուկյան 1', 'mhovhannisyan@ysu.am'], 342, sy, 10, 14);
}

function englishPage(ctx, rec) {
  const { doc, fonts, img } = ctx;
  const page = doc.addPage([612, PAGE_H]);
  const p = pen(page, fonts);
  const S = 10, PITCH = 14.75, W = 470.8;
  header(page, doc, img, { gybnX: 397.97 });
  p.centered('Armenian University Coalition for Biodiversity (AUCB)', 133.4, S, { color: BLUE });
  p.centered('Biodiversity Ambassadors Program', 150.2, S, { color: BLUE });
  const dt = issueDate(rec.created_at);
  p.draw(`${dt.d} ${EN_MONTHS[dt.m - 1]}, ${dt.y}`, 72, 195.1, S);
  p.right('Yerevan', 542.8, 195.1, S);
  p.centered(`CERTIFICATE No. ${letterNumber(rec, 'en')}`, 239.1, S);
  const full = `${rec.first_name_en} ${rec.last_name_en}`;
  const p1 = `This is to certify that ${full} (passport: ${rec.passport_number}, issued on ${dmy(rec.passport_issued_on)} by ${rec.passport_issued_by_en || rec.passport_issued_by}) is a participant in the Biodiversity Ambassadors program carried out by the Armenian University Coalition for Biodiversity (AUCB). From October 19 to 30, 2026, as well as, if necessary, on the days preceding or following this period, the participant will be involved in the preparatory and main events of the 17th Conference of the Parties (CBD COP17) to the UN Convention on Biological Diversity, to be held in Yerevan.`;
  const p2 = 'As part of the program, their activities include supporting the organization of events, guiding international delegations and visitors, carrying out informational and public-awareness work, as well as other relevant functions envisaged by the program.';
  let y = p.paragraph(p1, { baseline: 271.9, size: S, pitch: PITCH, w: W });
  y = p.paragraph(p2, { baseline: y + 27.6, size: S, pitch: PITCH, w: W });
  y = p.paragraph('This certificate is issued for presentation upon request.', { baseline: y + 30.7, size: S, pitch: PITCH, w: W });
  y = p.paragraph('For any questions, please contact us at ace@aua.am.', { baseline: y + 31.0, size: S, pitch: PITCH, w: W });
  y += 59.7;
  p.line('Sincerely,', 72, y, S);
  sigImages(page, img, y + 7.3, { w1: 79.3, h1: 42.1, w2: 81.7, h2: 42.1 });
  const sy = y + 49.0;
  signers(p, ['Alen Amirkhanian', 'Director, AUA Acopian Center', 'for the Environment', 'American University of Armenia', '40 Marshal Baghramyan, Yerevan 0019', 'alen@aua.am'], 77.2, sy, S, 14);
  signers(p, ['Mikayel Hovhannisyan', 'Vice Rector for International Relations,', 'Development and Innovations,', 'Yerevan State University', '0025, Yerevan, 1 Alek Manukyan', 'mhovhannisyan@ysu.am'], 342, sy, S, 14);
}

// which: 'hy' | 'en' | 'both' (a request made for one language can only produce that language).
export async function buildLetterPdf(rec, which = rec.lang) {
  const ctx = await newDoc();
  const want = which === 'both' ? ['hy', 'en'] : [which];
  for (const l of want) {
    if (l === 'hy' && rec.lang !== 'en') armenianPage(ctx, rec);
    if (l === 'en' && rec.lang !== 'hy') englishPage(ctx, rec);
  }
  ctx.doc.setTitle(`Letter of standing ${serialText(rec.serial)}`);
  ctx.doc.setCreator('Biodiversity Ambassadors Platform');
  return ctx.doc.save();
}

export async function downloadLetter(rec, which = rec.lang) {
  const data = await buildLetterPdf(rec, which);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = `AUCB-BA${serialText(rec.serial)}-${which === 'hy' ? 'Armenian' : which === 'en' ? 'English' : 'Armenian-English'}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
