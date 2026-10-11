/* =====================================================================
   🔐 Encrypts everything private so the published site holds no readable
   photos, videos, letter or answers.

   Usage (from this folder):   node encrypt.js

   Reads  private/content.js  (+ the photos/videos it mentions, inside private/)
   Writes secure/meta.json, secure/data.bin and secure/m/*.bin

   The key is made from the 5 login answers (2 names, 2 DOBs, secret code).
   It is never stored anywhere; the browser rebuilds it when she logs in.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PRIVATE = path.join(ROOT, 'private');
const OUT = path.join(ROOT, 'secure');
const ITERATIONS = 250000;
const MEDIA_RE = /\.(jpe?g|png|svg|gif|webp|mp4|mov|webm)$/i;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

// Must match keyMaterial() in js/main.js exactly
const normText = s => String(s).trim().toLowerCase().replace(/\s+/g, '');
const normDate = s => {
  const parts = String(s).trim().split(/\D+/).filter(Boolean);
  return parts.length === 3 ? parts[0].padStart(2, '0') + parts[1].padStart(2, '0') + parts[2] : parts.join('');
};
const keyMaterial = (names, dobs, secret) =>
  ['bday-v1', ...names.map(normText), ...dobs.map(normDate), normText(secret)].join('|');

function encrypt(key, buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]);          // iv | ciphertext | tag  (what WebCrypto expects)
}

const content = require(path.join(PRIVATE, 'content.js'));
const { login, ...data } = content;
if (!login || !login.usernames || !login.passwords || !login.secret) {
  console.error('private/content.js mein login.usernames, login.passwords aur login.secret chahiye.');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(keyMaterial(login.usernames, login.passwords, login.secret), salt, ITERATIONS, 32, 'sha256');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'm'), { recursive: true });

// Every photo/video path mentioned anywhere in the content gets encrypted under a random-looking name
const media = {};
let bytes = 0;
(function walk(v) {
  if (typeof v === 'string') {
    if (!MEDIA_RE.test(v) || media[v]) return;
    const file = path.join(PRIVATE, v);
    if (!fs.existsSync(file)) { console.warn('⚠️  file nahi mili, skip:', v); return; }
    const id = crypto.createHash('sha256').update(salt).update(v).digest('hex').slice(0, 20);
    const raw = fs.readFileSync(file);
    fs.writeFileSync(path.join(OUT, 'm', id + '.bin'), encrypt(key, raw));
    media[v] = { id, type: MIME[v.split('.').pop().toLowerCase()] || 'application/octet-stream', size: raw.length };
    bytes += raw.length;
  } else if (v && typeof v === 'object') {
    Object.values(v).forEach(walk);
  }
})(data);

const bundle = Buffer.from(JSON.stringify({ v: 1, data, media }), 'utf8');
fs.writeFileSync(path.join(OUT, 'data.bin'), encrypt(key, bundle));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ v: 1, salt: salt.toString('base64'), iterations: ITERATIONS }));

console.log(`✅ Ho gaya! ${Object.keys(media).length} photos/videos (${(bytes / 1048576).toFixed(1)} MB) + content encrypt hua -> secure/`);
console.log('   Ab secure/ folder ke saath site upload karo. private/ folder kabhi upload mat karna.');
