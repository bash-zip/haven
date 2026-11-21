// Drives the Haven Setup UI over CDP and screenshots every page.
// Usage: HAVEN_SETUP_DEBUG=1 HavenSetup.exe, then: node tools/setup-verify.mjs
import { writeFileSync } from 'node:fs';

const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = targets.find(t => t.type === 'page' && t.url.includes('install.haven'));
if (!page) { console.error('no target; got:', targets.map(t => t.type + ' ' + t.url)); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, resolve);
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('timeout ' + method)); } }, 15000);
});
await new Promise(r => ws.onopen = r);

const evalJS = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`C:/Haven/.debug/setup-${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};

await send('Page.enable');
await sleep(600);

// 1 — welcome
console.log('h1:', await evalJS(`document.querySelector('h1')?.textContent`));
console.log('chips:', await evalJS(`[...document.querySelectorAll('.chip')].map(c => c.textContent).join(', ')`));
await shot('1-welcome');

// 2 — location
await evalJS(`document.querySelector('#next').click()`);
await sleep(500);
console.log('dir value:', await evalJS(`document.querySelector('#dir')?.value`));
console.log('hint:', await evalJS(`document.querySelector('#dirHint span')?.textContent`));
console.log('next enabled:', await evalJS(`!document.querySelector('#next').disabled`));
await shot('2-location');

// 3 — validation → options
await evalJS(`document.querySelector('#next').click()`);
await sleep(1200);
console.log('h2 after check (expect options):', await evalJS(`document.querySelector('h2')?.textContent`));
console.log('autostart on:', await evalJS(`document.querySelector('#autostart')?.classList.contains('on')`));
await evalJS(`document.querySelector('#desktopShortcut').click()`);
await evalJS(`document.querySelector('#launchAfter').click()`);
await evalJS(`document.querySelector('#launchAfter').click()`); // toggle off→on→off? verify transition works
console.log('desktopShortcut on:', await evalJS(`document.querySelector('#desktopShortcut')?.classList.contains('on')`));
console.log('launchAfter on:', await evalJS(`document.querySelector('#launchAfter')?.classList.contains('on')`));
await shot('3-options');

// 4 — installing (rendered via the test hook; no real install)
await evalJS(`window.__testGoto(3)`);
await sleep(150);
await evalJS(`window.__testProgress(47, 'Copying files…', 'Haven.exe', 1)`);
await sleep(700);
console.log('pct text:', await evalJS(`document.querySelector('#pct')?.textContent`));
console.log('phase 1 active:', await evalJS(`document.querySelector('#ph1')?.classList.contains('active')`));
console.log('phase 0 done:', await evalJS(`document.querySelector('#ph0')?.classList.contains('done')`));
await shot('4-installing');

// 5 — finish
await evalJS(`window.__testGoto(4)`);
await sleep(150);
console.log('finish h2:', await evalJS(`document.querySelector('h2')?.textContent`));
console.log('launch button:', await evalJS(`document.querySelector('#launch')?.textContent`));
await shot('5-finish');

console.log('VERIFY OK');
ws.close();
process.exit(0);
