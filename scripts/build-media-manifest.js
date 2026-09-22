'use strict';
// Lists the images in media/home-carousel and media/about so the static site can show whatever is dropped in.
// Run `npm run build:media` before deploying to a static host; the dev server does this on every request.
const fs = require('fs');
const path = require('path');

const MEDIA = path.join(__dirname, '..', 'media');
const IMG = /\.(png|jpe?g|webp|gif|avif)$/i;

function list(dir) {
  try {
    return fs.readdirSync(path.join(MEDIA, dir)).filter((f) => IMG.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => `/media/${dir}/${encodeURIComponent(f)}`);
  } catch { return []; }
}

// Finds a team photo at the top level of media/ by name, tolerant of spelling like "Alen pic.png" or
// "narek.jpg" — matches on the normalised (lowercase, no spaces/punctuation) filename containing the key.
function findTeamPhoto(key) {
  let files;
  try { files = fs.readdirSync(MEDIA).filter((f) => IMG.test(f) && fs.statSync(path.join(MEDIA, f)).isFile()); }
  catch { return null; }
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hit = files.find((f) => norm(f).includes(key));
  return hit ? `/media/${encodeURIComponent(hit)}` : null;
}

function buildManifest() {
  return {
    carousel: list('home-carousel'),
    about: list('about'),
    team: { alen: findTeamPhoto('alen'), narek: findTeamPhoto('narek') },
  };
}

if (require.main === module) {
  const out = path.join(MEDIA, 'manifest.json');
  fs.writeFileSync(out, JSON.stringify(buildManifest(), null, 2));
  console.log('Wrote', out);
}
module.exports = { buildManifest };
