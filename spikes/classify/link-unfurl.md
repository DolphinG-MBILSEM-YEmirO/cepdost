# Mini-spike: Instagram/TikTok link-unfurl (2026-08-05)

Canlı test edildi (curl ile gerçek isteklerle, dokümantasyona güvenmeden).

## TikTok — ÇÖZÜLDÜ, resmi ve stabil

```
GET https://www.tiktok.com/oembed?url=<video_url>
```
Token/uygulama kaydı gerekmiyor, resmi dokümante edilmiş API, CORS açık
(istenirse client-side'dan bile çağrılabilir, ama biz backend'den
çağıracağız). Gerçek istekte döndü: `title` (tam caption + hashtag'ler),
`author_name`, `author_url`, `thumbnail_url`. F2 için doğrudan
kullanılabilir, ek iş gerektirmiyor.

## Instagram — kısmi çözüldü, iki katmanlı plan gerekiyor

**1) Resmi oEmbed (graph.facebook.com/instagram_oembed):** 15 Haziran
2026'da token zorunluluğu kalktı (Meta'nın kendi duyurusu) ve gerçek testte
de token olmadan 200 döndü — **ama** dönen `html` alanı gerçek caption
içermiyor, sadece Instagram'ın kendi JS'iyle dolduracağı boş bir "yükleniyor"
iskeleti. `fields=title,author_name` gibi ek alan istemeye çalışınca
`"Provide valid app ID"` hatası döndü — yani token'sız erişim sadece "bu
embed widget'ı sayfama gömebilirim" senaryosunu çözüyor, backend'den
programatik caption metni çekmeyi çözmüyor.

**2) Ham sayfa + `og:description` meta etiketi (resmi olmayan ama işe
yarayan yöntem):** `curl -A "Mozilla/5.0 (iPhone...)" https://www.instagram.com/p/<shortcode>/`
başarıyla 200 döndü ve `og:description` içinde gerçek caption vardı:
`"3,703 likes, 71 comments - diegoquinteiro on June 16, 2015: "Wii Gato (Lipe Sleep)"."`
— beğeni/yorum sayısı, kullanıcı adı, tarih, caption hepsi tek string'de,
regex ile ayrıştırılabilir.

**Risk/dürüstlük notu:** Bu yöntem 2 numaralı resmi bir API değil, sayfa
scrape'i — Instagram herhangi bir zaman bunu değiştirebilir/engelleyebilir,
resmi API kadar garantili değil. Tek tek, kullanıcının kendi paylaştığı
linkler için (toplu/otomatik tarama değil) düşük riskli ama sıfır risk
değil. **Güvenlik ağı zaten elimizde:** Spike C'de OCR kalitesi çok iyi
çıktığı için, link-unfurl başarısız olursa F2 kullanıcıya "bu linkten
başlık çekemedim, bir ekran görüntüsü de eklemek ister misin?" diyebilir —
yani bu risk projeyi durdurmuyor, sadece ikinci bir yol.

## F2 için sonuç

- **TikTok linki geldi:** doğrudan resmi oEmbed çağır, sorun yok.
- **Instagram linki geldi:** önce ham sayfa + `og:description` dene; parse
  edilemezse/boşsa kullanıcıya ekran görüntüsü isteği düş.
- Her iki durumda da bu adım F2'nin LLM çağrısından ÖNCE gelen ayrı bir
  "zenginleştirme" katmanı: paylaşılan ham veri → (varsa link-unfurl) →
  tek LLM çağrısı → yapılandırılmış kayıt.
