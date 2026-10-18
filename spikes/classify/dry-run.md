# Spike D — kuru deneme sonuçları

4 gerçek/gerçekçi örnek üzerinde prompt'un ne üreteceği elle simüle edildi.

## 1) Instagram OCR çıktısı (Spike C)

**Girdi:** `kahvedunyasi\nBakırköy sahilde muhteşem bir kahve mekânı bulduk,
kesinlikle gidilmeli! Fiyatlar da gayet uygun\n#istanbul #kahve #bakırköy`

**Beklenen çıktı:**
```json
{
  "kategori": "mekan",
  "baslik": "Bakırköy sahilde kahve mekânı",
  "tarih": null,
  "konum": "Bakırköy, İstanbul",
  "ozet_not": "Fiyatlar uygun. Kaynak: @kahvedunyasi (Instagram)"
}
```
Temiz, sorunsuz — arşivin "vay be" anı tam olarak bu senaryo.

## 2) TikTok OCR çıktısı (Spike C)

**Girdi:** `@lezzetduragi\nBu tarifi mutlaka denemelisiniz! Sarımsaklı makarna
sadece 15 dakikada hazır. Malzemeler: makarna, sarımsak, tereyağı, kırmızı
pul biber\n♪ orijinal ses - lezzetduragi`

**Beklenen çıktı:**
```json
{
  "kategori": "tarif",
  "baslik": "Sarımsaklı makarna (15 dakika)",
  "tarih": null,
  "konum": null,
  "ozet_not": "Malzemeler: makarna, sarımsak, tereyağı, kırmızı pul biber. Kaynak: @lezzetduragi (TikTok)"
}
```
Sorunsuz.

## 3) Notes OCR çıktısı (Spike C) — çift bilgi içeren zor örnek

**Girdi:** `Yapılacaklar\n4 Ağustos 2026\nYarın saat 19:00'da Ayşe ile
buluşacağız, Beşiktaş'taki yeni restoranda. Rezervasyon adı: Yunus Emir.
Not: Doğum günü hediyesi almayı unutma!`

**Beklenen çıktı:**
```json
{
  "kategori": "etkinlik",
  "baslik": "Ayşe ile buluşma — Beşiktaş",
  "tarih": "2026-08-05T19:00:00",
  "konum": "Beşiktaş",
  "ozet_not": "Rezervasyon adı: Yunus Emir. Ayrıca ilgisiz bir hatırlatma vardı: doğum günü hediyesi alınacak."
}
```
**Bulgu:** Tek-kayıt şeması burada bilgi kaybediyor — hediye hatırlatması
ana kayda gömülüyor, kendi başına aranabilir/hatırlatılabilir bir öğe
olmuyor. MVP için kabul edilebilir (bkz. prompt.md), ama kullanıcıya
sonradan "bu notta 2 ayrı şey var, ayırayım mı?" sorusu sorulabilecek bir
v2 fikri olarak not edildi.

## 4) Gerçek Spike A kaydı — çıplak Instagram linki

**Girdi:** `text: "https://www.instagram.com/p/DaF9F1alh_3/?igsh=..."`
(başlık yok, OCR yok — kullanıcı ekran görüntüsü değil doğrudan link
paylaştı)

**Beklenen çıktı:**
```json
{
  "kategori": "not",
  "baslik": "Instagram gönderisi",
  "tarih": null,
  "konum": null,
  "ozet_not": "https://www.instagram.com/p/DaF9F1alh_3/?igsh=..."
}
```

**Bulgu (önemli, ürün dokümanındaki F2'yi doğruluyor):** Çıplak bir link,
hiçbir bağlam olmadan, LLM'e anlamlı hiçbir şey vermiyor — sonuç kullanışsız
bir "Instagram gönderisi" kaydı. Ürün dokümanı zaten F2'de "Linkten
başlık/açıklama çekme"yi öngörmüş, bu spike bunun neden **zorunlu** olduğunu
somut olarak gösterdi: link-unfurl adımı olmadan, kullanıcı sadece link
paylaştığında (ekran görüntüsü değil) uygulama neredeyse hiçbir şey
anlayamıyor.

**Yeni risk:** Instagram/TikTok gönderi sayfaları genelde girişsiz
scrape'e kapalı; resmi oEmbed API'leri de günümüzde çoğunlukla
uygulama-onaylı erişim/token gerektiriyor. Bu, F2'nin kapsamına başta
düşünülenden daha zor bir alt problem ekliyor — ayrı bir mini-spike hak
ediyor: "Instagram/TikTok linkinden başlık/açıklama gerçekten
çekilebiliyor mu, hangi yöntemle (oEmbed, og:meta, ücretli API)?"

## Genel sonuç

Prompt tasarımı OCR'lı girdilerde (asıl kullanım senaryosu — ekran
görüntüsü) güçlü çalışıyor. Çıplak link paylaşımı ayrı, çözülmemiş bir alt
problem — F2'ye başlamadan önce bunun için küçük bir araştırma/spike daha
gerekiyor.
