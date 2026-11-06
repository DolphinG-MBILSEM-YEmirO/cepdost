// Clean demo world for store screenshots. Run with a fresh relay.
const { as } = require('./lib.cjs');
const ANA = [['b', 'Sohbet'], ['w', 1200]];
const GRUP = [...ANA, ['t', 'Hafta sonu ekibi', 0], ['w', 2500]];
const DM = (ad) => [...ANA, ['t', ad, 0], ['w', 2500]];
const yaz = (m) => [['ph', 'Mesaj yaz...', m], ['k', 'Enter'], ['w', 1200]];
const insanlar = [
  ['elif', 'Elif Yılmaz', 'elif.yilmaz'],
  ['can', 'Can Demir', 'can.demir'],
  ['deniz', 'Deniz Ak', 'deniz.ak'],
  ['ece', 'Ece Şen', 'ece.sen'],
  ['mert', 'Mert Kaya', 'mert.kaya'],
];
const adim = process.argv[2] || 'all';
(async () => {
  if (adim === 'all' || adim === 'hesap') {
    for (const [k, ad, kadi] of insanlar) {
      await as(k, [['w', 500], ['b', 'Geç'], ['w', 800], ['b', 'Hesap oluştur'], ['w', 1500], ['f', 'input', 0, ad], ['f', 'input', 1, kadi], ['t', 'Herkes'], ['b', 'Devam et'], ['w', 2500],
        ['f', 'input[type=password]', 0, 'sifre-12345'], ['f', 'input[type=password]', 1, 'sifre-12345'], ['b', 'Devam et'], ['w', 3000]]);
      console.log('hesap', k);
    }
  }
  if (adim === 'all' || adim === 'arkadas') {
    const istek = [...ANA, ['t', 'Arkadaşlar', 0], ['w', 1000]];
    for (const [, , kadi] of insanlar.slice(1)) istek.push(['f', 'input', 0, kadi], ['b', 'Ara'], ['w', 1500], ['br', 'Ekle|İstek gönder|Arkadaş ekle', 0], ['w', 1500]);
    // The search result's add button comes last on the page.
    await as('elif', istek.map((a) => (a[0] === 'br' ? ['brl', a[1]] : a)).map((a) => (a[0] === 'brl' ? ['br', a[1], -1] : a)));
    for (const [k] of insanlar.slice(1)) await as(k, [['w', 1500], ...ANA, ['t', 'Arkadaşlar', 0], ['w', 1500], ['br', 'Kabul', 0], ['w', 2000]]);
    console.log('arkadaslar tamam');
  }
  if (adim === 'all' || adim === 'grup') {
    if (!process.env.SADECE_PLAN) await as('elif', [['w', 1500], ...ANA, ['t', 'Arkadaşlar', 0], ['w', 1200], ['br', '^Grup kur'], ['w', 800],
      ['ph', 'Kadıköy Ekibi', 'Hafta sonu ekibi'], ['ph', 'Cumartesi buluşmaları (isteğe bağlı)', 'Kahvaltı, bisiklet ve sinema'],
      ['d', '🏖️'], ['d', 'Can'], ['d', 'Deniz'], ['d', 'Ece'], ['d', 'Mert'], ['d', '^Kur$'], ['w', 2500],
      ...yaz('Selam ekip! Cumartesi ne yapıyoruz? 🙌')]);
    if (!process.env.SADECE_PLAN) await as('can', [['w', 1500], ...GRUP, ...yaz('Hava güneşliymiş, sahilde bisiklet?')]);
    if (!process.env.SADECE_PLAN) await as('deniz', [['w', 1500], ...GRUP, ...yaz('Olur! Piknik de yaparız 🧺')]);
    await as('elif', [['w', 1500], ['b', 'Oluştur: paylaşım ya da plan'], ['w', 800], ['br', 'Bir yere gitmek'], ['w', 1000], ['t', 'Bir grupla'], ['t', 'Hafta sonu ekibi'], ['b', 'Devam'],
      ['ph', 'Ya da kendin yaz...', 'Bisiklet turu + piknik'], ['t', '🏃', 0], ['ph', 'Mekan adı ya da semt', 'Caddebostan Sahili'],
      ['f', 'input[type=date]', 0, '2026-11-07'], ['f', 'input[type=time]', 0, '11:00'], ['t', '3 sa'], ['b', 'Devam'], ['br', 'Gruba gönder', 0], ['w', 3000], ['p', 'grup plani']]);
  }
  if (adim === 'all' || adim === 'grupyanit') {
    for (const [k, y] of [['can', 'Geliyorum'], ['deniz', 'Geliyorum'], ['mert', 'Geliyorum'], ['ece', 'Belki']])
      await as(k, [['w', 1500], ...GRUP, ['t', 'Planlar', 1], ['w', 1500], ['b', y, true, 0], ['w', 2000]]);
    await as('ece', [['w', 1500], ...GRUP, ...yaz('Ben de büyük ihtimalle varım ☀️')]);
    await as('mert', [['w', 1500], ...GRUP, ...yaz('Ben limonata getiriyorum 🍋')]);
  }
  if (adim === 'all' || adim === 'davet') {
    const plan = (kisiler, baslik, emoji, emojiNo, yer, gun, saat, sure) => [['w', 1500], ['b', 'Oluştur: paylaşım ya da plan'], ['w', 800], ['br', 'Bir yere gitmek'], ['w', 1000], ['t', 'Arkadaşlarımla'],
      ...kisiler.map((k) => ['t', k]), ['b', 'Devam'], ...(baslik === 'Kahve' || baslik === 'Sinema' ? [['b', new RegExp(baslik).source.replace(/^/, ''), false]].map(() => ['br', baslik, 0]) : [['ph', 'Ya da kendin yaz...', baslik], ['t', emoji, emojiNo]]), ['ph', 'Mekan adı ya da semt', yer],
      ['b', gun, true], ['f', 'input[type=time]', 0, saat], ...(sure ? [['t', sure]] : []), ['b', 'Devam'], ['br', 'davet gönder'], ['w', 3000]];
    await as('elif', plan(['Ece Şen'], 'Kahve', '☕', 1, 'Moda Sahili, Kadıköy', 'Bugün', '20:30', null));
    await as('elif', plan(['Can Demir', 'Deniz Ak'], 'Sinema', '🎬', 0, 'Kadıköy Sineması', 'Yarın', '20:30', null));
    await as('ece', [['w', 1500], ...DM('Elif Yılmaz'), ['b', 'Geliyorum', true, 0], ['w', 2000], ...yaz('Süper, görüşürüz! ☕')]);
    await as('can', [['w', 1500], ...DM('Elif Yılmaz'), ['b', 'Geliyorum', true, 0], ['w', 2000]]);
    await as('deniz', [['w', 1500], ...DM('Elif Yılmaz'), ['b', 'Geliyorum', true, 0], ['w', 2000], ...yaz('Biletleri ben alırım 🎟️')]);
  }
  if (adim === 'all' || adim === 'paylasim') {
    const paylas = (foto, yer, metin, yildiz) => [['w', 1500], ['b', 'Oluştur: paylaşım ya da plan'], ['w', 800], ['br', '^Paylaşım'], ['w', 1200], ['up', foto, 0], ['w', 2500],
      ['ph', 'Moda Sahili, Kadıköy', yer], ['ph', 'Kahvesi harika, akşamüstü manzarası ayrı güzel…', metin], ['r', `${yildiz} yıldız`], ['b', 'Paylaş', true], ['w', 4000]];
    await as('mert', paylas('foto/bisiklet.jpg', 'Caddebostan Sahili', 'Sahil yolunda 20 km 🚲 Cumartesi rotası belli oldu!', 4));
    await as('can', paylas('foto/kahvalti.jpg', 'Yeldeğirmeni, Kadıköy', 'Serpme kahvaltı efsaneydi, kesinlikle tekrar 🍳', 5));
    await as('deniz', paylas('foto/gunbatimi.jpg', 'Moda Sahili, Kadıköy', 'Moda’da gün batımı yine büyüledi 🧡 Çay + simit + bu manzara', 5));
    await as('elif', [['w', 2000], ['b', 'Akış'], ['w', 3000], ['b', 'Tepki', false, 0], ['w', 800], ['b', '😍'], ['w', 1500],
      ['b', 'Tepki', false, 1], ['w', 800], ['b', '🔥'], ['w', 1500]]);
  }
  console.log('seed done', adim);
})().catch((e) => { console.error('SEED FAIL', e.message); process.exit(1); });
