/**
 * Verifies the app boots from file:// (no web server) using the embedded dataset.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'C:\\Users\\hrupe\\OneDrive\\Desktop\\About_me\\LifeLink_App\\LifeLink';
const PORT = 9335;
const PROFILE = join(process.env.TEMP, 'lifelink-cdp-file');
const FILE_URL = 'file:///' + (APP + '\\index.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, nextId = 0;
const pending = new Map();
const errors = [];
const consoleErrors = [];
function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.delete(id)) reject(new Error('timeout ' + method)); }, 20000);
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' -> ' + detail)); return ok; }

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 60; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch (e) {}
  await sleep(500);
}
ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  }
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    consoleErrors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  }
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

await send('Page.navigate', { url: FILE_URL });
await sleep(3500);

let ok = true;
ok &= check('boots from file://', await ev(`!!document.getElementById('app')`));
const state = await ev(`({
  hash: location.hash,
  welcome: document.body.innerText.includes('every second matters'),
  errors: (window.App && App.errors) ? App.errors.slice(0,3) : [],
  loc: App && App.location ? App.location : null
})`);
ok &= check('welcome screen shows', state.welcome, JSON.stringify(state));

/* onboard + reach hospital list with embedded data */
await ev(`document.querySelector('[data-act="get-started"]').click()`);
await sleep(500);
await ev(`document.querySelector('[data-act="perm-not"]').click()`);
await sleep(600);
await ev(`location.hash = '#/hospitals'`);
await sleep(900);
const list = await ev(`({
  cards: document.querySelectorAll('#hospitals-list .hosp-card').length,
  count: (document.getElementById('result-count')||{}).textContent
})`);
ok &= check('embedded dataset renders (81 cards)', list.cards === 81, JSON.stringify(list));

await ev(`location.hash = '#/hospital/hospital-010'`);
await sleep(700);
ok &= check('detail works from file://',
  (await ev(`document.body.innerText`)).includes('Required Documents'));

ok &= check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));
ok &= check('no console errors (manifest/CORS clean)', consoleErrors.length === 0,
  consoleErrors.slice(0, 4).join(' || '));
ok &= check('no CORS/manifest errors at all',
  !consoleErrors.some((e) => /CORS|manifest|ERR_FAILED/i.test(e)),
  consoleErrors.filter((e) => /CORS|manifest|ERR_FAILED/i.test(e)).join(' || '));
ok &= check('manifest link absent on file:// (would be blocked)',
  !(await ev(`!!document.querySelector('link[rel="manifest"]')`)));

try { await send('Browser.close'); } catch (e) {}
try { edge.kill(); } catch (e) {}
process.exit(ok ? 0 : 1);
