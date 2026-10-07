/**
 * LifeLink interactive smoke test — drives a headless Edge via CDP.
 *
 * Usage:  node tools/cdp-test.mjs   (app must be served on 127.0.0.1:8777)
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:8777';
const PORT = 9333;
const PROFILE = join(process.env.TEMP, 'lifelink-cdp-profile');
const SHOTS = join(process.env.TEMP, 'lifelink-shots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let failures = 0;
function check(name, ok, detail) {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' -> ' + (detail || '')}`);
  if (!ok) failures++;
}

/* ---------------------------------------------------------------- CDP ---- */

const pageErrors = [];
const consoleErrors = [];

function makeClient() {
  let ws = null;
  let nextId = 0;
  const pending = new Map();
  const handlers = [];

  function send(method, params = {}) {
    const id = ++nextId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error('timeout: ' + method));
      }, 20000);
    });
  }

  async function open(url) {
    ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        handlers.forEach((fn) => fn(msg));
      }
    };
  }

  return { send, open, on: (fn) => handlers.push(fn) };
}

const pageCdp = makeClient();
const browserCdp = makeClient();
const send = pageCdp.send;

pageCdp.on((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    pageErrors.push((d.exception && d.exception.description) || d.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
  }
});

async function waitFor(fn, timeout = 8000, interval = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) { /* retry */ }
    await sleep(interval);
  }
  return null;
}

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true
  });
  if (r.exceptionDetails) {
    throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

async function goto(path, waitMs = 1200) {
  await send('Page.navigate', { url: BASE + path });
  await sleep(waitMs);
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
}

/* ---------------------------------------------------------------- main --- */

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  if (existsSync(join(SHOTS, 'last-run.txt'))) {}

  const edge = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--disable-extensions',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--window-size=390,844',
    'about:blank'
  ], { stdio: 'ignore' });

  /* wait for devtools endpoint */
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch (e) { /* not up yet */ }
    await sleep(500);
  }
  if (!targets) { console.log('FAIL could not start Edge CDP'); edge.kill(); process.exit(1); }

  const page = targets.find((t) => t.type === 'page');
  await pageCdp.open(page.webSocketDebuggerUrl);

  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  await browserCdp.open(ver.webSocketDebuggerUrl);
  await browserCdp.send('Browser.setPermission', {
    permission: { name: 'geolocation' },
    setting: 'granted',
    origin: BASE
  }).catch((e) => console.log('geolocation permission grant failed:', e.message));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  });
  await send('Emulation.setGeolocationOverride', {
    latitude: 26.8467, longitude: 80.9461, accuracy: 15
  });

  /* ---------- 1. first launch ---------- */
  await goto('/tools/clearstate.html', 700);
  check('state cleared', (await evaluate('document.title')) === 'STATE_CLEARED_OK');

  await goto('/', 1400);
  let t = await evaluate(`document.body.innerText`);
  check('welcome: slogan', t.includes('Find the right hospital when every second matters'));
  check('welcome: get started btn', await evaluate(`!!document.querySelector('[data-act="get-started"]')`));
  check('welcome: nav hidden', await evaluate(`document.getElementById('bottom-nav').hidden === true`));
  await shot('01-welcome');

  /* ---------- 2. permission screen ---------- */
  await evaluate(`document.querySelector('[data-act="get-started"]').click()`);
  await sleep(600);
  t = await evaluate('document.body.innerText');
  check('permission: heading', t.includes('Allow LifeLink to use your location?'));
  check('permission: three choices',
    await evaluate(`!!document.querySelector('[data-act="perm-allow"]') &&
                    !!document.querySelector('[data-act="perm-manual"]') &&
                    !!document.querySelector('[data-act="perm-not"]')`));
  await shot('02-permission');

  /* choose "Not Now" -> home must still work */
  await evaluate(`document.querySelector('[data-act="perm-not"]').click()`);
  await sleep(800);
  t = await evaluate('document.body.innerText');
  check('home after Not Now', t.includes('Need a hospital?'));
  check('home quick actions', t.includes('Find Hospital') && t.includes('Blood Information'));
  check('home emergency 108', t.includes('Emergency helpline 108'));
  check('home has disease trends tile', await evaluate(
    `!!document.querySelector('[data-route="#/trends"]')`));
  check('home has settings tile', await evaluate(
    `!!document.querySelector('.quick-grid [data-route="#/settings"]')`));
  await shot('03-home');

  /* ---------- 3. location permission via geolocation override ---------- */
  await evaluate(`document.querySelector('[data-act="use-location"]').click()`);
  const landed = await waitFor(async () => (await evaluate('location.hash')) === '#/hospitals', 12000, 300);
  const hash1 = await evaluate('location.hash');
  const hasLoc = await evaluate(`!!(window.App && App.location && App.location.mode === 'gps')`);
  check('use my location sets gps', hasLoc, 'hash=' + hash1);
  check('use my location lands on hospitals', !!landed, 'hash=' + hash1);
  t = await evaluate('document.body.innerText');
  check('hospitals sorted by distance', t.includes('Sorted by distance'));
  check('hospitals count', /81 facilities found/.test(t), t.slice(0, 200));
  await shot('04-hospitals');

  /* ---------- 4. search ---------- */
  const hasSearch = await evaluate(`!!document.querySelector('[data-input="search"]')`);
  check('hospitals screen mounted', hasSearch);
  await evaluate(`
    const i = document.querySelector('[data-input="search"]');
    i.value = 'KGMU';
    i.dispatchEvent(new Event('input', {bubbles:true}));
  `);
  await sleep(700);
  const cardsAfterSearch = await evaluate(`document.querySelectorAll('#hospitals-list .hosp-card').length`);
  check('search narrows results', cardsAfterSearch > 0 && cardsAfterSearch < 10, 'cards=' + cardsAfterSearch);
  const searchText = await evaluate(`document.getElementById('result-count').textContent`);
  check('search result count text', /facilit(y|ies) found/.test(searchText) && !/facilitys/.test(searchText), searchText);

  await evaluate(`document.querySelector('[data-act="clear-search"]').click()`);
  await sleep(500);

  /* ---------- 5. filters ---------- */
  await evaluate(`document.querySelector('[data-key="icu"]').click()`);
  await sleep(400);
  const icuCount = await evaluate(`document.getElementById('result-count').textContent`);
  check('icu filter applies', icuCount.startsWith('57'), icuCount);
  await evaluate(`document.querySelector('[data-key="icu"]').click()`);
  await sleep(400);

  /* ---------- 6. hospital details ---------- */
  await evaluate(`document.querySelector('#hospitals-list [data-act="open-hospital"]').click()`);
  await sleep(800);
  const dHash = await evaluate('location.hash');
  check('opens hospital detail', dHash.startsWith('#/hospital/'), dHash);
  t = await evaluate('document.body.innerText');
  check('detail: required documents', t.includes('Required Documents'));
  check('detail: emergency section', t.includes('Emergency') && t.includes('ICU'));
  check('detail: call + route buttons',
    await evaluate(`!!document.querySelector('[data-act="get-route"]')`));
  check('detail: back button', await evaluate(`!!document.querySelector('[data-act="back"]')`));
  await shot('05-hospital-detail');

  /* ---------- 7. route screen (live OSRM) ---------- */
  await evaluate(`document.querySelector('[data-act="get-route"]').click()`);
  await sleep(4500);
  const routeState = await evaluate(`({
    hash: location.hash,
    dist: (document.getElementById('route-dist')||{}).textContent,
    time: (document.getElementById('route-time')||{}).textContent,
    mode: (document.getElementById('route-mode')||{}).textContent,
    note: (document.getElementById('route-note')||{}).innerText,
    mapReady: !!(document.querySelector('#route-map.leaflet-container')),
    nav: !!document.querySelector('[data-act="start-navigation"]')
  })`);
  check('route hash', routeState.hash.startsWith('#/route/'), routeState.hash);
  check('route distance shown', routeState.dist && routeState.dist !== '—', routeState.dist);
  check('route mode resolved', routeState.mode === 'Road' || routeState.mode === 'Straight', routeState.mode);
  check('route has offline/fallback handling', typeof routeState.note === 'string' && routeState.note.length > 0, routeState.note);
  check('route map mounted', routeState.mapReady);
  check('start navigation button', routeState.nav);
  await shot('06-route');

  /* ---------- 8. bottom nav + map ---------- */
  await evaluate(`document.querySelector('[data-act="nav"][data-route="#/map"]').click()`);
  await sleep(2500);
  const mapState = await evaluate(`({
    hash: location.hash,
    container: !!(document.querySelector('#map.leaflet-container')),
    pins: document.querySelectorAll('#map .pin').length,
    user: !!document.querySelector('#map .pin-user'),
    sheet: document.getElementById('map-sheet').innerText.slice(0, 120),
    activeTab: (document.querySelector('.nav-item.active')||{}).innerText
  })`);
  check('map hash', mapState.hash === '#/map', mapState.hash);
  check('map container created', mapState.container);
  check('81 hospital pins', mapState.pins === 81, 'pins=' + mapState.pins);
  check('user marker present', mapState.user);
  check('map bottom sheet shows hospital', /Hospital|hospital/.test(mapState.sheet), mapState.sheet);
  check('map tab active', (mapState.activeTab || '').includes('Map'), mapState.activeTab);
  await shot('07-map');

  const tiles = await waitFor(async () =>
    evaluate(`document.querySelectorAll('#map img.leaflet-tile-loaded').length`), 10000, 500);
  check('map tiles load from OSM', (tiles || 0) > 0, 'tiles=' + tiles);

  await evaluate(`document.querySelector('[data-act="map-style"]').click()`);
  await sleep(500);
  const styleToast = await evaluate(`document.getElementById('toast-root').innerText`);
  check('map style toggle', /map style/i.test(styleToast), styleToast);

  await evaluate(`document.querySelector('[data-act="map-locate"]').click()`);
  await sleep(900);
  const locateToast = await evaluate(`document.getElementById('toast-root').innerText`);
  check('map locate recenters', /Centered on your location/.test(locateToast), locateToast);

  /* marker click -> sheet updates */
  const sheetBefore = await evaluate(`document.getElementById('map-sheet').innerText`);
  await evaluate(`
    (() => {
      const pins = document.querySelectorAll('#map .pin');
      const target = pins[20];
      const holder = target.closest('.leaflet-marker-icon') || target;
      holder.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, clientX:190, clientY:400}));
    })()
  `);
  await sleep(600);
  const sheetAfter = await evaluate(`document.getElementById('map-sheet').innerText`);
  check('marker click updates sheet', sheetAfter !== sheetBefore, 'unchanged');
  check('sheet has view details + route',
    await evaluate(`!!document.querySelector('#map-sheet [data-act="open-hospital"]') &&
                    !!document.querySelector('#map-sheet [data-act="get-route"]')`));

  /* ---------- 9. manual location flow ---------- */
  await evaluate(`location.hash = '#/map?select=1'`);
  await sleep(2000);
  const rect = await evaluate(`(() => {
    const r = document.querySelector('#map').getBoundingClientRect();
    return {x: r.left + r.width/2, y: r.top + r.height/2};
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await sleep(700);
  const pickState = await evaluate(`({
    sheet: document.getElementById('map-sheet').innerText,
    enabled: !document.querySelector('[data-act="confirm-location"]').disabled
  })`);
  check('pick pin placed', /Selected location/.test(pickState.sheet), pickState.sheet.slice(0, 80));
  check('confirm enabled after pick', pickState.enabled);
  await shot('08-manual-pick');

  await evaluate(`document.querySelector('[data-act="confirm-location"]').click()`);
  await sleep(900);
  const afterConfirm = await evaluate(`({
    hash: location.hash,
    mode: App.location && App.location.mode
  })`);
  check('confirm -> hospitals list', afterConfirm.hash === '#/hospitals', afterConfirm.hash);
  check('manual location saved', afterConfirm.mode === 'manual', afterConfirm.mode);

  /* ---------- 10. secondary screens ---------- */
  for (const [route, needle] of [
    ['#/blood', ['Blood units recorded', 'Demo information']],
    ['#/trends', ['TOTAL CASES', 'Most reported conditions', 'Cases by area', 'not live surveillance']],
    ['#/find', ['Smart Hospital Finder', 'Patient name', 'Find nearest hospital', 'offline demo dataset']],
    ['#/documents', ['You may need:', 'Document requirements may vary']],
    ['#/about', ['LifeLink', 'v1.0.0', 'Disclaimer']],
    ['#/settings', ['Clear cached data', 'App version']]
  ]) {
    await evaluate(`location.hash = ${JSON.stringify(route)}`);
    await sleep(700);
    const body = await evaluate('document.body.innerText');
    const missing = needle.filter((n) => !body.includes(n));
    check('screen ' + route, missing.length === 0, 'missing: ' + missing.join(', '));
  }
  await shot('09-settings');

  /* trends numbers must match the embedded dataset exactly */
  await evaluate(`location.hash = '#/trends'`);
  await sleep(800);
  const trendState = await evaluate(`(() => {
    let total = 0, reporting = 0;
    const diseases = new Set();
    (window.LIFELINK_HOSPITALS || []).forEach(h => {
      const d = h.disease_cases || {};
      const ks = Object.keys(d);
      if (!ks.length) return;
      reporting++;
      ks.forEach(k => { diseases.add(k); total += d[k]; });
    });
    const vals = [...document.querySelectorAll('.route-stat .rs-val')].map(el => el.textContent);
    return {
      hash: location.hash,
      expTotal: total, expDiseases: diseases.size, expReporting: reporting,
      shownTotal: vals[0], shownDiseases: vals[1], shownReporting: vals[2],
      bars: document.querySelectorAll('.trend-bar').length,
      hospitalRows: document.querySelectorAll('#screen .list-row').length
    };
  })()`);
  check('trends route active', trendState.hash === '#/trends', trendState.hash);
  check('trends total matches dataset', String(trendState.expTotal) === trendState.shownTotal,
    trendState.expTotal + ' vs ' + trendState.shownTotal);
  check('trends disease count matches', String(trendState.expDiseases) === trendState.shownDiseases,
    trendState.expDiseases + ' vs ' + trendState.shownDiseases);
  check('trends hospital count matches', String(trendState.expReporting) === trendState.shownReporting,
    trendState.expReporting + ' vs ' + trendState.shownReporting);
  check('trends renders bars + hospital rows',
    trendState.bars >= 15 && trendState.hospitalRows >= 10, JSON.stringify(trendState));

  /* ---------- 11. back navigation ---------- */
  await evaluate(`location.hash = '#/hospitals'`);
  await sleep(600);
  await evaluate(`document.querySelector('#hospitals-list [data-act="open-hospital"]').click()`);
  await sleep(700);
  await evaluate(`document.querySelector('[data-act="back"]').click()`);
  await sleep(700);
  check('back returns to list', (await evaluate('location.hash')) === '#/hospitals');

  /* ---------- 12. UI quality checks ---------- */
  await evaluate(`location.hash = '#/home'`);
  await sleep(900);

  const icons = await evaluate(`(() => {
    const bad = [];
    document.querySelectorAll('.fa-icon').forEach(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width > 40) bad.push(el.className + ':' + Math.round(r.width) + 'px');
      if (!/Font Awesome 7 Free/.test(cs.fontFamily)) bad.push('font:' + el.className);
    });
    return bad;
  })()`);
  check('icons render as glyphs (not raw text)', icons.length === 0, icons.join(', '));

  const overflow = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
  check('no horizontal overflow (home)', overflow,
    'scrollW=' + await evaluate('document.documentElement.scrollWidth'));

  const touch = await evaluate(`(() => {
    const small = [];
    document.querySelectorAll('.btn, .nav-item, .icon-btn, .map-fab').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 40) small.push((el.innerText||el.getAttribute('aria-label')||'?').slice(0,20) + ':' + Math.round(r.height));
    });
    return small;
  })()`);
  check('touch targets >= 40px', touch.length === 0, touch.join(', '));

  const headerFits = await evaluate(`(() => {
    const el = document.querySelector('.header-title');
    return el ? el.scrollWidth <= el.clientWidth + 1 : false;
  })()`);
  check('header title not clipped', headerFits);

  await evaluate(`location.hash = '#/hospitals'`);
  await sleep(700);
  const overflowHosp = await evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
  check('no horizontal overflow (hospitals)', overflowHosp);

  /* ---------- 12b. desktop layout (app column) ---------- */
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  const desk = await evaluate(`(() => {
    const app = document.getElementById('app').getBoundingClientRect();
    const nav = document.getElementById('bottom-nav').getBoundingClientRect();
    const head = document.getElementById('app-header').getBoundingClientRect();
    return {
      appW: Math.round(app.width), appLeft: Math.round(app.left),
      navW: Math.round(nav.width), headW: Math.round(head.width),
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  })()`);
  check('desktop: 480px column, centered, no overflow',
    desk.appW === 480 && desk.appLeft === 400 && desk.navW === 480 && desk.headW === 480 && desk.overflow,
    JSON.stringify(desk));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(500);

  /* ---------- 13. PWA: service worker + precache ---------- */
  await evaluate(`location.hash = '#/home'`);
  await sleep(600);
  const pwa = await evaluate(`(async () => {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 6000))
    ]);
    const keys = await (window.caches ? caches.keys() : Promise.resolve([]));
    let shellCached = false;
    for (const k of keys) {
      const c = await caches.open(k);
      if (await c.match(location.href) || await c.match('index.html') || await c.match('./')) shellCached = true;
    }
    return {
      manifest: !!document.querySelector('link[rel="manifest"]'),
      ready: !!(reg && (reg.active || reg.installing || reg.waiting)),
      controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      cacheKeys: keys,
      shellCached: shellCached
    };
  })()`);
  check('manifest linked', pwa.manifest);
  check('service worker registered', pwa.ready, JSON.stringify(pwa.cacheKeys));
  check('app shell precached', pwa.shellCached, JSON.stringify(pwa.cacheKeys));

  /* ---------- 14. offline mode ---------- */
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
  });
  await sleep(600);
  await evaluate(`window.dispatchEvent(new Event('offline'))`);
  await sleep(400);
  const bannerVisible = await evaluate(`!document.getElementById('offline-banner').hidden`);
  check('offline banner shows', bannerVisible);

  await evaluate(`location.hash = '#/hospital/hospital-010'`);
  await sleep(900);
  const offlineDetail = await evaluate('document.body.innerText');
  check('hospital details work offline', offlineDetail.includes('Required Documents') && offlineDetail.includes('Hospital Information'));

  /* full offline reload must be served by the service worker */
  await evaluate(`location.hash = '#/home'`);
  await sleep(400);
  await send('Page.reload', { ignoreCache: false });
  await sleep(4000);
  let reloadState;
  try {
    reloadState = await evaluate(`({
      app: !!document.getElementById('app'),
      text: document.body.innerText.slice(0, 300),
      controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller)
    })`);
  } catch (e) {
    reloadState = { app: false, text: 'evaluate failed: ' + e.message, controller: false };
  }
  check('offline reload serves app shell from cache',
    reloadState.app && (/Need a hospital\?/.test(reloadState.text) || /every second matters/.test(reloadState.text)),
    reloadState.text.slice(0, 120).replace(/\n/g, ' '));
  await shot('10-offline-reload').catch(() => {});

  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
  });
  await sleep(400);
  await evaluate(`window.dispatchEvent(new Event('online'))`);

  /* ---------- 14b. CSV import / export / reset ---------- */
  await evaluate(`location.hash = '#/settings'`);
  await sleep(900);
  const csvUi = await evaluate(`({
    section: document.body.innerText.includes('Update hospital data'),
    input: !!document.querySelector('[data-input="csv-import"]'),
    exportBtn: !!document.querySelector('[data-act="export-csv"]'),
    resetRow: !!document.querySelector('[data-act="reset-import"]'),
    edits: App.editCount()
  })`);
  check('settings shows CSV import + export UI',
    csvUi.section && csvUi.input && csvUi.exportBtn, JSON.stringify(csvUi));
  check('clean dataset starts with no CSV edits', csvUi.edits === 0 && !csvUi.resetRow, JSON.stringify(csvUi));

  const exp = await evaluate(`(() => {
    const lines = App.exportCsv().split('\\r\\n').filter(Boolean);
    return {
      header: lines[0],
      rows: lines.length - 1,
      has10: lines.slice(1).some(l => /^10,/.test(l))
    };
  })()`);
  check('export CSV has header + 81 hospital rows',
    exp.header === 'hospital_id,name,location,area,contact,lat,lon,rating,price_range,doctors,blood_stock,ambulances,icu_available,beds_available,emergency_services,disease_cases'
    && exp.rows === 81 && exp.has10, JSON.stringify(exp));

  const imp = await evaluate(`(async () => {
    const header = 'hospital_id,name,location,area,contact,lat,lon,rating,price_range,doctors,blood_stock,ambulances,icu_available,beds_available,emergency_services,disease_cases';
    const row = '10,Imported Test Hospital,Gomti Nagar,Gomti Nagar,0522-000-0001,26.8500,80.9400,4.5,400-800,,,,,,,,Yes,,Yes,';
    const input = document.querySelector('[data-input="csv-import"]');
    const dt = new DataTransfer();
    dt.items.add(new File([header + '\\r\\n' + row + '\\r\\n'], 'test.csv', { type: 'text/csv' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 20 && App.editCount() === 0; i++) await new Promise(r => setTimeout(r, 200));
    const h = App.byId('hospital-010');
    return {
      edits: App.editCount(),
      name: h ? h.name : null,
      editedFlag: h ? !!h.edited : null,
      icu: h ? !!h.icu_available : null,
      meta: !!(App.importMeta && App.importMeta.updated === 1 && App.importMeta.file === 'test.csv'),
      resetRow: !!document.querySelector('[data-act="reset-import"]'),
      status: document.body.innerText.includes('Updated 1 hospital from CSV')
    };
  })()`);
  check('CSV import merges row + flags hospital as edited',
    imp.edits === 1 && imp.name === 'Imported Test Hospital' && imp.editedFlag && imp.icu, JSON.stringify(imp));
  check('import meta + status row update in settings',
    imp.meta && imp.resetRow && imp.status, JSON.stringify(imp));

  await send('Page.reload', { ignoreCache: false });
  await sleep(2600);
  await waitFor(() => evaluate(`!!window.App && App.hospitals && App.hospitals.length === 81`), 8000);
  const persisted = await evaluate(`(() => {
    const h = App.byId('hospital-010');
    return {
      edits: App.editCount(),
      name: h ? h.name : null,
      meta: !!(App.importMeta && App.importMeta.updated === 1)
    };
  })()`);
  check('imported edit survives a full reload',
    persisted.edits === 1 && persisted.name === 'Imported Test Hospital' && persisted.meta,
    JSON.stringify(persisted));

  await evaluate(`location.hash = '#/hospital/hospital-010'`);
  await sleep(900);
  const impDetail = await evaluate('document.body.innerText');
  check('hospital detail shows imported name + edit note',
    impDetail.includes('Imported Test Hospital') && impDetail.includes('Updated locally from a CSV import'),
    impDetail.slice(0, 120).replace(/\n/g, ' '));
  await shot('11-csv-imported').catch(() => {});

  await evaluate(`location.hash = '#/settings'`);
  await sleep(800);
  await evaluate(`document.querySelector('[data-act="reset-import"]').click()`);
  await sleep(400);
  check('reset import asks for confirmation', await evaluate(
    `(document.querySelector('.modal-title') || {}).textContent === 'Restore original dataset?'`));
  await evaluate(`document.querySelector('.modal-actions .btn[data-value="yes"]').click()`);
  await sleep(700);
  const restored = await evaluate(`(() => {
    const h = App.byId('hospital-010');
    return {
      edits: App.editCount(),
      name: h ? h.name : null,
      meta: !!App.importMeta,
      resetRow: !!document.querySelector('[data-act="reset-import"]')
    };
  })()`);
  check('reset restores original hospital data',
    restored.edits === 0 && !restored.meta && !restored.resetRow
    && restored.name && restored.name !== 'Imported Test Hospital', JSON.stringify(restored));

  /* ---------- 14c. smart hospital finder ---------- */
  await evaluate(`location.hash = '#/home'`);
  await sleep(700);
  check('home shows smart finder shortcut',
    await evaluate(`!!document.querySelector('.find-hero[data-route="#/find"]')`));
  await evaluate(`document.querySelector('.find-hero').click()`);
  await sleep(700);
  const form = await evaluate(`({
    hash: location.hash,
    fields: ['f-name','f-dept','f-bmin','f-bmax','f-area','f-blood'].every(id => document.getElementById(id)),
    crit: document.querySelectorAll('input[name="f-crit"]').length,
    defCrit: (document.querySelector('input[name="f-crit"]:checked') || {}).value,
    deptOpts: document.querySelectorAll('#dept-list option').length,
    areaOpts: document.querySelectorAll('#area-list option').length,
    submit: !!document.querySelector('[data-act="smart-search"]')
  })`);
  check('finder form has all criteria + defaults',
    form.hash === '#/find' && form.fields && form.crit === 4 && form.defCrit === 'high'
    && form.deptOpts >= 10 && form.areaOpts >= 20 && form.submit, JSON.stringify(form));

  const eng = await evaluate(`(() => {
    const r = App.smartSearch({ department: 'Cardiology', budgetMin: 200, budgetMax: 900, bloodGroup: 'A+', criticality: 'critical', area: 'Hazratganj' });
    const loose = App.smartSearch({ budgetMin: 1, budgetMax: 5 });
    const nearest = App.smartSearch({});
    const best = r.results[0];
    return {
      count: r.results.length,
      originLabel: r.origin.label,
      allIcu: r.results.every(x => x.h.icu_available),
      sorted: r.results.every((x, i) => i === 0 || r.results[i - 1].score >= x.score),
      best: best ? { id: best.h.id, reasons: best.reasons.length, hasDoc: !!(best.doctor && best.doctor.doctor), matched: !!(best.doctor && best.doctor.matched) } : null,
      relaxed: loose.relaxedBudget && loose.results.length === 81,
      nearestCount: nearest.results.length,
      originFallback: nearest.origin.label,
      bloodGroups: (App.bloodGroups || []).length,
      depts: App.departments().length
    };
  })()`);
  check('finder engine: criticality hard-filters to ICU',
    eng.count > 0 && eng.count < 81 && eng.allIcu, JSON.stringify(eng));
  check('finder engine: results sorted, best has reasons + matching doctor',
    eng.sorted && eng.best && eng.best.reasons >= 3 && eng.best.hasDoc && eng.best.matched,
    JSON.stringify(eng.best));
  check('finder engine: area origin, budget relaxation, fallbacks',
    eng.originLabel === 'Hazratganj' && eng.relaxed && eng.nearestCount === 81
    && eng.originFallback === 'your current location'
    && eng.bloodGroups === 6 && eng.depts >= 10, JSON.stringify(eng));

  await evaluate(`(() => {
    document.getElementById('f-name').value = 'Test Patient';
    document.getElementById('f-dept').value = 'Cardiology';
    document.getElementById('f-bmin').value = '200';
    document.getElementById('f-bmax').value = '900';
    document.getElementById('f-area').value = 'Hazratganj';
    document.getElementById('f-blood').value = 'A+';
    document.querySelector('input[name="f-crit"][value="critical"]').checked = true;
    return true;
  })()`);
  await evaluate(`document.querySelector('[data-act="smart-search"]').click()`);
  await sleep(800);
  const res = await evaluate(`({
    hash: location.hash,
    patient: document.body.innerText.includes('Test Patient'),
    bestName: !!(document.querySelector('.find-name') || {}).textContent,
    critical: !!document.querySelector('.prio-chip.prio-critical'),
    reasons: document.querySelectorAll('.reason-chip').length,
    doctor: !!(document.querySelector('.find-doc-name') || {}).textContent,
    blood: document.body.innerText.includes('in stock') || document.body.innerText.includes('out of stock'),
    others: document.querySelectorAll('.section .list .list-row').length,
    adjust: !!document.querySelector('[data-act="find-reset"]'),
    disclaimer: document.body.innerText.includes('not a medical triage')
  })`);
  check('finder UI renders recommendation card',
    res.hash === '#/find' && res.patient && res.bestName && res.critical
    && res.reasons >= 3 && res.doctor && res.blood && res.others >= 1
    && res.adjust && res.disclaimer, JSON.stringify(res));
  await shot('12-smart-search').catch(() => {});

  await evaluate(`document.querySelector('[data-act="find-reset"]').click()`);
  await sleep(600);
  check('finder reset returns to prefilled form',
    await evaluate(`document.getElementById('f-name') && document.getElementById('f-name').value === 'Test Patient'`));

  /* ---------- 15. privacy modal + clear cached data ---------- */
  await evaluate(`location.hash = '#/settings'`);
  await sleep(700);
  await evaluate(`document.querySelector('[data-act="show-privacy"]').click()`);
  await sleep(400);
  check('privacy modal opens', await evaluate(`
    document.getElementById('modal-root').classList.contains('open') &&
    document.querySelector('.modal-title').textContent === 'Privacy'`));
  await evaluate(`document.querySelector('.modal-actions .btn[data-value="ok"]').click()`);
  await sleep(300);
  check('privacy modal closes', await evaluate(
    `!document.getElementById('modal-root').classList.contains('open')`));

  await evaluate(`document.querySelector('[data-act="clear-cache"]').click()`);
  await sleep(400);
  check('clear-cache asks for confirmation', await evaluate(
    `(document.querySelector('.modal-title') || {}).textContent === 'Clear cached data?'`));
  await evaluate(`document.querySelector('.modal-actions .btn[data-value="yes"]').click()`);
  await sleep(1800);
  const cleared = await evaluate(`(async () => ({
    keys: window.caches ? await caches.keys() : ['no-caches-api'],
    loc: App.location,
    onboarded: localStorage.getItem('lifelink.onboarded'),
    toast: document.getElementById('toast-root').innerText
  }))()`);
  check('clear-cache empties caches + location + state',
    cleared.keys.length === 0 && cleared.loc === null && cleared.onboarded === null,
    JSON.stringify(cleared));
  check('clear-cache toast', /cleared/i.test(cleared.toast || ''), cleared.toast);

  /* ---------- report ---------- */
  const allErrors = [...pageErrors, ...consoleErrors.filter((e) => !/favicon|tile\.openstreetmap|net::ERR/.test(e))];
  check('no uncaught JS errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' || '));
  check('no console errors', consoleErrors.filter((e) => !/favicon|tile\.openstreetmap|net::ERR|OSRM/.test(e)).length === 0,
    consoleErrors.slice(0, 4).join(' || '));

  const report = results.join('\n') + '\n\nERRORS:\n' + (allErrors.join('\n') || '(none)') + '\n';
  writeFileSync(join(SHOTS, 'last-run.txt'), report, 'utf8');
  console.log(report);
  console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed. Screenshots: ${SHOTS}`);

  try { await browserCdp.send('Browser.close'); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('DRIVER ERROR', err);
  process.exit(2);
});
