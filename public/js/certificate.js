// Participation certificate: the signed template (public/certificate/template.pdf, a copy of the original design
// with only the two name lines removed) with the ambassador's names drawn back in at exactly the same place, size and
// colour, in the template's own typeface (Atyan Dsegh). Checked pixel-for-pixel against the original template.
const BASE = '/certificate/';

const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('letter_assets')); document.head.appendChild(s); });
const bytes = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('letter_assets'); return new Uint8Array(await r.arrayBuffer()); };

let assets;
function loadAssets() {
  return (assets ||= (async () => {
    if (!window.PDFLib) await loadScript('/vendor/pdf-lib.min.js');
    if (!window.fontkit) await loadScript('/vendor/fontkit.umd.min.js');
    const [tpl, font] = await Promise.all([bytes(`${BASE}template.pdf`), bytes(`${BASE}AtyanDsegh-Regular.ttf`)]);
    return { tpl, font };
  })().catch((e) => { assets = null; throw e; }));
}

// In the template (842.25 x 595.5 pt): name lines are 54.35 pt, baseline ~364 pt from the bottom, left edge of the
// English column 41.4 pt and of the Armenian column 453.75 pt; each column is ~345 pt wide.
const SIZE = 54.35047947276204;
const COLOR = [0.7804, 0.9686, 0.5373];
const LEFT = { x: 41.41, y: 364.82, w: 345 };
const RIGHT = { x: 453.75, y: 363.87, w: 345 };
const MIN_SIZE = 24;

// The font has no accented Latin letters; names like "Sosé" are drawn without the accent.
export const latinForFont = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
// "Տրվում է <Անուն Ազգանուն>ին": the surname takes the dative ending.
export const armenianDative = (s) => { const t = String(s).replace(/\s+/g, ' ').trim(); return /ին$/.test(t) ? t : `${t}ին`; };

export async function buildCertificatePdf({ hy, en }) {
  const a = await loadAssets();
  const { PDFDocument, rgb } = window.PDFLib;
  const doc = await PDFDocument.load(a.tpl);
  doc.registerFontkit(window.fontkit);
  const font = await doc.embedFont(a.font, { subset: true });
  const page = doc.getPage(0);
  const draw = (text, box) => {
    let size = SIZE;
    const w = font.widthOfTextAtSize(text, size);
    if (w > box.w) size = (SIZE * box.w) / w;
    if (size < MIN_SIZE) throw new Error('name_too_long');
    page.drawText(text, { x: box.x, y: box.y, size, font, color: rgb(...COLOR) });
  };
  draw(latinForFont(en), LEFT);
  draw(armenianDative(hy), RIGHT);
  doc.setTitle('Certificate of Participation');
  doc.setCreator('Biodiversity Ambassadors Platform');
  return doc.save();
}

export async function downloadCertificate(names) {
  const data = await buildCertificatePdf(names);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = `Biodiversity-Ambassador-Certificate-${latinForFont(names.en).replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
