/**
 * Builds a clean `www/` folder for Capacitor (excludes dev tools/tests).
 * Usage: node tools/make-www.mjs
 */
import { cpSync, mkdirSync, existsSync, statSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js'];
const DIRS = ['css', 'js', 'data', 'icons', 'vendor'];

if (existsSync(WWW)) rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

function size(p) {
  const s = statSync(p);
  if (s.isDirectory()) return readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0);
  return s.size;
}

for (const f of FILES) {
  if (!existsSync(join(ROOT, f))) { console.error('missing: ' + f); process.exit(1); }
  cpSync(join(ROOT, f), join(WWW, f));
}
for (const d of DIRS) {
  if (!existsSync(join(ROOT, d))) { console.error('missing dir: ' + d); process.exit(1); }
  cpSync(join(ROOT, d), join(WWW, d), { recursive: true });
}

const total = size(WWW);
console.log('www/ built: ' + (total / 1024 / 1024).toFixed(2) + ' MB');
console.log('ready for:  npx cap sync');
