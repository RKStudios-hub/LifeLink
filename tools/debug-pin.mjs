/**
 * Debug: why does a synthetic map click not drop a pin in #/map?select=1?
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://127.0.0.1:8777';
const PORT = 9334;
const PROFILE = join(process.env.TEMP, 'lifelink-cdp-debug');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, nextId = 0;
const pending = new Map();
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

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'
], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 60; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch (e) {}
  await sleep(500);
}
ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setGeolocationOverride', { latitude: 26.8467, longitude: 80.9461, accuracy: 15 });

await send('Page.navigate', { url: BASE + '/tools/setstate.html' });
await sleep(800);
await send('Page.navigate', { url: BASE + '/#/map?select=1' });
await sleep(3000);

console.log('hash:', await ev('location.hash'));
console.log('sheet:', (await ev(`document.getElementById('map-sheet').innerText`)).replace(/\n/g, ' | '));
console.log('geometry:', JSON.stringify(await ev(`(() => {
  const m = document.getElementById('map');
  const r = m.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  const el = document.elementFromPoint(cx, cy);
  return {
    rect: {l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)},
    center: {x: Math.round(cx), y: Math.round(cy)},
    atPoint: el ? (el.tagName + '.' + el.className).slice(0, 80) : null,
    innerW: window.innerWidth, innerH: window.innerHeight,
    leaflet: !!m.classList.contains('leaflet-container'),
    handlers: typeof L === 'undefined' ? 'no-L' : 'L-ok'
  };
})()`)));

/* instrument the map container for any click */
await ev(`(() => {
  window.__hits = [];
  const m = document.getElementById('map');
  ['pointerdown','pointerup','click','mousedown','mouseup'].forEach(t =>
    m.addEventListener(t, e => window.__hits.push(t + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY)), true));
  window.__hitCount = () => window.__hits.slice();
})()`);

const g = await ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()`);
console.log('clicking at', g);

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.x, y: g.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: 1 });
await sleep(800);

console.log('events seen:', JSON.stringify(await ev('window.__hitCount()')));
console.log('sheet after:', (await ev(`document.getElementById('map-sheet').innerText`)).replace(/\n/g, ' | '));
console.log('confirm disabled:', await ev(`document.querySelector('[data-act="confirm-location"]').disabled`));

/* try a plain JS MouseEvent on the container */
await ev(`(() => {
  const m = document.getElementById('map');
  const r = m.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  ['pointerdown','pointerup','click'].forEach(t => m.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, clientX:cx, clientY:cy, button:0})));
})()`);
await sleep(800);
console.log('sheet after JS events:', (await ev(`document.getElementById('map-sheet').innerText`)).replace(/\n/g, ' | '));
console.log('events seen:', JSON.stringify(await ev('window.__hitCount()')));

try { await send('Browser.close'); } catch (e) {}
try { edge.kill(); } catch (e) {}
process.exit(0);
