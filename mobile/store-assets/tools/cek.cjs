// Raw capture of one screen as Elif. Usage: node cek.cjs <name> '<actions json>'
const { chromium } = require('playwright');
const { act } = require('./lib.cjs');
const [,, ad, json, olcek] = process.argv;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: Number(olcek || 3), locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: true, hasTouch: true, storageState: 'state-elif.json', permissions: ['geolocation'], geolocation: { latitude: 40.99, longitude: 29.03 } });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:5173/?relays=ws://127.0.0.1:7777'); await p.waitForTimeout(3500);
  await act(p, JSON.parse(json), ad);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `raw/${ad}.png` });
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
