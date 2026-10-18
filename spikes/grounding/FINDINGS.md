# Mini-spike: Gemini grounding (canlı arama) fizibilitesi — 2026-08-06

Kullanıcının "mekan hakkında yorumlardan öne çıkanları araştır" isteği için
Gemini'nin Google Search grounding özelliği canlı test edildi.

## Sonuç: bu hesapla ücretsiz kademede mümkün değil

- **`gemini-3.5-flash-lite` + `google_search` tool:** Canlı istekte **429
  RESOURCE_EXHAUSTED** — Google'ın resmi fiyatlandırma sayfası da "Gemini
  3.x modellerinde grounding ücretsiz kademede yok" diyor. Doğrulandı.
- **`gemini-2.5-flash` / `gemini-2.5-flash-lite`** (dokümantasyon "günde 500
  ücretsiz grounding isteği" diyordu): Bu proje/API anahtarı için **404 "no
  longer available to new users"** — 2.5 nesli bu hesaba tamamen kapalı.

Yani: mevcut Gemini hesabıyla, hiçbir modelde ücretsiz+kartsız canlı arama
mümkün değil. `test-grounding.ts` bu denemenin kod kaydı — kalıcı bir
fonksiyon değil, Supabase'de deploy edilmiş haliyle bırakıldı (zararsız,
kimse çağırmıyor, MCP araçlarında fonksiyon silme aracı yoktu).

## Ardından denenen alternatifler

Aynı ihtiyaç (mekan yorumlarından gerçek öneri) için üç sağlayıcı
karşılaştırıldı — detaylar `spikes/classify/` değil burada, çünkü bu F7'ye
özel yeni bir araştırma:

| Sağlayıcı | Kartsız ücretsiz mi? | Yorum/tips verisi var mı? |
|---|---|---|
| Gemini grounding | Hayır (yukarıda) | — |
| Google Places API (New) | Hayır — kart şart, ama kişisel kullanımda muhtemelen $0 (ayda 5.000 arama / 1.000 detay ücretsiz) | Evet, "Enterprise+Atmosphere" katmanında gerçek yorumlar |
| Foursquare Places API | Evet, kart istemiyor ($200/ay kredi) | Hayır — "tips/ratings" tamamen Premium (ilk istekten ücretli), 500 ücretsiz çağrı Haziran 2026'dan beri (10.000'den düşürüldü) sadece temel arama için |

**Kullanıcı kararı (ilk):** kart ekleyip Google Places API
(Enterprise+Atmosphere) ile devam edildi.

**Güncelleme — kullanıcı kararı (son, aynı gün):** Google Cloud'da
faturalandırma kurulumu sırasında bir hata alındı, kullanıcı kartlı yoldan
tamamen vazgeçip kartsız/ücretsiz hibrit yola döndü:
- **Mekan adı yoksa:** Foursquare Places API (`/v3/places/search`,
  kartsız) ile gerçek yakın mekanlar — puan/yorum yok, sadece isim/adres/
  mesafe.
- **Mekan adı varsa:** Foursquare'in de yorum verisi ücretsizde yok, o
  yüzden Gemini'nin kendi (grounding'siz) bilgisine soruluyor — bu
  UYDURABİLİR, istemci tarafı sonucu her zaman "doğrulanmamış bilgi"
  etiketiyle gösteriyor (bkz. `CaptureModal.tsx`/`RecordDetail.tsx`'teki
  amber renkli uyarı kartı). Canlı testte Gemini "Nusr-Et Etiler" gibi
  bilinen bir mekan için bile dürüstçe "güvenilir bir bilgim yok" dedi —
  uydurma riski düşük görünüyor ama garanti değil.

Kod: `supabase/functions/classify/index.ts` içindeki F7 bloğu
(`foursquareYakinAra`, `mekanBilgiTahmini`).
