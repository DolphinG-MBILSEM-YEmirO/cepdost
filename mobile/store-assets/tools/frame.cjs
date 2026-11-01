// Store screenshots: caption on the section's gradient, the raw capture below
// bleeding off the bottom edge. iPhone 6.9" 1320x2868, Android 1080x2160.
const { chromium } = require('playwright');
const path = require('path');
const SAHNELER = [
  ['2-hatirlatma', ['#F43F5E', '#F97316'], 'Bütün planların<br>tek yerde', 'Bugün, yarın, bu hafta: hepsi bir bakışta.', 'All your plans<br>in one place', 'Today, tomorrow, this week: at a glance.'],
  ['7-plan', ['#EF4444', '#F97316'], 'Kimin geldiğini<br>anında gör', 'Davet et, cevaplar tek ekranda toplansın.', 'See who’s coming,<br>instantly', 'Invite friends, every answer in one place.'],
  ['3-grup', ['#C026D3', '#EC4899'], 'Grubunla planla,<br>orada konuş', 'Grup planı sohbete düşer, herkes tek dokunuşla yanıtlar.', 'Plan together,<br>right in the chat', 'Group plans land in the chat; answer with one tap.'],
  ['5-arkadas', ['#DB2777', '#C026D3'], 'Arkadaşların<br>ne zaman müsait?', 'Herkese uyan saati Sharloop bulsun.', 'When are your<br>friends free?', 'Let Sharloop find a time that suits everyone.'],
  ['4-akis', ['#7C3AED', '#A855F7'], 'Gittiğin yerleri<br>paylaş', 'Fotoğraf, puan ve not; arkadaşların da gitmek istesin.', 'Share the places<br>you love', 'Photos, ratings and notes your friends can follow.'],
  ['6-profil', ['#4F46E5', '#7C3AED'], 'Ayın özeti<br>seninle', 'Kaç plan yaptın, en çok kiminle buluştun.', 'Your month<br>at a glance', 'How many plans, and who you saw the most.'],
];
const BOYUTLAR = { iphone: { w: 440, h: 956, ss: 372, ust: 236, baslik: 40 }, android: { w: 360, h: 720, ss: 290, ust: 196, baslik: 33 } };
(async () => {
  const b = await chromium.launch();
  for (const [cihaz, o] of Object.entries(BOYUTLAR)) {
    const p = await b.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 3 });
    for (const dil of ['tr', 'en']) {
      for (const [i, [ad, [c1, c2], bTr, aTr, bEn, aEn]] of SAHNELER.entries()) {
        const [baslik, alt] = dil === 'tr' ? [bTr, aTr] : [bEn, aEn];
        const img = 'data:image/png;base64,' + require('fs').readFileSync(path.resolve('raw', ad + '.png')).toString('base64');
        await p.setContent(`<html><body style="margin:0;width:${o.w}px;height:${o.h}px;overflow:hidden;font-family:'Inter Display','Inter',sans-serif;background:linear-gradient(160deg,${c1},${c2});position:relative">
          <div style="position:absolute;width:${o.w * 0.9}px;height:${o.w * 0.9}px;border-radius:50%;background:rgba(255,255,255,.12);top:-${o.w * 0.35}px;right:-${o.w * 0.3}px"></div>
          <div style="position:absolute;width:${o.w * 0.6}px;height:${o.w * 0.6}px;border-radius:40%;background:rgba(255,255,255,.08);bottom:${o.h * 0.25}px;left:-${o.w * 0.35}px;transform:rotate(20deg)"></div>
          <div style="position:relative;padding:${o.ust * 0.2}px 24px 0;text-align:center;color:#fff">
            <div style="font-size:${o.baslik}px;font-weight:800;line-height:1.08;letter-spacing:-0.02em">${baslik}</div>
            <div style="font-size:${o.baslik * 0.4}px;font-weight:500;opacity:.92;margin-top:10px;line-height:1.35">${alt}</div>
          </div>
          <img src="${img}" style="position:absolute;left:${(o.w - o.ss) / 2}px;top:${o.ust}px;width:${o.ss}px;border-radius:${o.ss * 0.09}px;box-shadow:0 30px 60px rgba(30,10,60,.35),0 0 0 6px rgba(255,255,255,.35)">
        </body></html>`);
        await p.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0); await p.waitForTimeout(100);
        await p.screenshot({ path: `store/${cihaz}-${dil}-${i + 1}.png` });
      }
    }
    await p.close();
  }
  await b.close();
})();
