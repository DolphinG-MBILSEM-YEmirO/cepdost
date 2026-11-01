// Shared Playwright helpers for the store-screenshot tools: one person's
// browser (state-<name>.json keeps their sign-in and local data) and a tiny
// action list runner. See ../README.md.
for (const d of ['shots', 'raw', 'store']) require('fs').mkdirSync(d, { recursive: true });
const { chromium } = require('playwright');
exports.open = async (name) => {
  const b = await chromium.launch();
  const fs = require('fs');
  const state = `state-${name}.json`;
  const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: true, hasTouch: true, storageState: fs.existsSync(state) ? state : undefined, permissions: ['geolocation'], geolocation: { latitude: 40.99, longitude: 29.03 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/WebSocket|favicon|api\//.test(m.text())) errs.push('console ' + m.text().slice(0,200)); });
  await p.goto('http://127.0.0.1:5173/?relays=ws://127.0.0.1:7777');
  await p.waitForTimeout(2000);
  return { b, ctx, p, errs, save: async () => { await ctx.storageState({ path: state, indexedDB: true }); } , done: async () => { await p.waitForTimeout(3000); await ctx.storageState({ path: state, indexedDB: true }); if (errs.length) console.log('ERRORS:\n' + errs.join('\n')); await b.close(); } };
};
exports.text = async (p) => (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 1200);
exports.act = async (p, list, tag = '') => {
  for (const a of list) {
    const [t, x, y, z] = a;
    try {
      if (t === 'b') await p.getByRole('button', { name: x, exact: !!y }).nth(z ?? 0).click();
      else if (t === 'br') await p.getByRole('button', { name: new RegExp(x) }).nth(y ?? 0).click();
      else if (t === 'd') await p.getByRole('dialog').last().getByRole('button', { name: new RegExp(x) }).nth(y ?? 0).click();
      else if (t === 't') await p.getByText(x, { exact: true }).nth(y ?? 0).click();
      else if (t === 'f') await p.locator(x).nth(y).fill(z);
      else if (t === 'ph') await p.getByPlaceholder(x).fill(y);
      else if (t === 'r') await p.getByRole('radio', { name: x }).first().click();
      else if (t === 'up') await p.locator('input[type=file]').nth(y ?? 0).setInputFiles(x.split(','));
      else if (t === 'k') await p.keyboard.press(x);
      else if (t === 'w') await p.waitForTimeout(x);
      else if (t === 's') await p.screenshot({ path: `shots/${x}.png` });
      else if (t === 'p') console.log(tag, x, (await exports.text(p)).slice(0, 600));
      await p.waitForTimeout(t === 'w' ? 0 : 500);
    } catch (e) { await p.screenshot({ path: `shots/FAIL-${tag}.png` }); throw new Error(`${tag} ${JSON.stringify(a)}: ${e.message.split('\n')[0]}`); }
  }
};
exports.as = async (kisi, list) => { const s = await exports.open(kisi); try { await exports.act(s.p, list, kisi); } finally { await s.done(); } };
