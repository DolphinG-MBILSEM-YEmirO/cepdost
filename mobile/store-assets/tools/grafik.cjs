// Google Play feature graphic (1024x500), TR and EN, from two raw captures.
const { chromium } = require('playwright');
const fs = require('fs');
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 500 } });
  for (const [dil, slogan, alt] of [['tr', 'Paylaş. Planla. Birlikte yaşa.', 'Arkadaşlarınla plan kur, kimin geldiğini gör.'], ['en', 'Share. Plan. Live it together.', 'Make plans with friends and see who’s coming.']]) {
    await p.setContent(`<html><body style="margin:0;width:1024px;height:500px;overflow:hidden;font-family:'Inter Display','Inter',sans-serif;background:linear-gradient(120deg,#F43F5E 0%,#C026D3 55%,#7C3AED 100%);position:relative;color:#fff">
      <div style="position:absolute;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.10);top:-260px;left:-120px"></div>
      <div style="position:absolute;width:300px;height:300px;border-radius:40%;background:rgba(255,255,255,.08);bottom:-140px;left:330px;transform:rotate(25deg)"></div>
      <div style="position:absolute;left:64px;top:118px;width:520px">
        <div style="display:flex;align-items:center;gap:18px">
          <img src="${b64(require('path').join(__dirname, '../../../public/icons/icon-512.png'))}" style="width:84px;height:84px;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.25)">
          <div style="font-size:62px;font-weight:800;letter-spacing:-0.03em">Sharloop</div>
        </div>
        <div style="font-size:34px;font-weight:700;margin-top:30px;line-height:1.15;letter-spacing:-0.01em">${slogan}</div>
        <div style="font-size:21px;font-weight:500;opacity:.9;margin-top:12px">${alt}</div>
      </div>
      <img src="${b64('raw/3-grup.png')}" style="position:absolute;right:250px;top:70px;width:210px;border-radius:24px;transform:rotate(-6deg);box-shadow:0 20px 50px rgba(20,0,50,.4),0 0 0 4px rgba(255,255,255,.35)">
      <img src="${b64('raw/2-hatirlatma.png')}" style="position:absolute;right:40px;top:40px;width:210px;border-radius:24px;transform:rotate(5deg);box-shadow:0 20px 50px rgba(20,0,50,.4),0 0 0 4px rgba(255,255,255,.35)">
    </body></html>`);
    await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
    await p.screenshot({ path: `store/feature-graphic-${dil}.png` });
  }
  await b.close();
})();
