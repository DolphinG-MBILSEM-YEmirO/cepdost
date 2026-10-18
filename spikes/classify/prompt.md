# Spike D — F2 sınıflandırma prompt taslağı

Not: Bu spike Claude Haiku düşünülerek yazıldı (bu ortamda canlı bir
Anthropic API anahtarı yoktu, o yüzden prompt tasarımı + 4 örnek üzerinde
elle kuru deneme olarak kaldı — gerçek API çağrısı değil). **Güncelleme
(Hafta 3):** Gerçek inşada sağlayıcı Gemini'ye çevrildi — Anthropic'in
kalıcı bir ücretsiz kademesi yok, Gemini'de var, kullanıcı bunu tercih
etti. `supabase/functions/classify/index.ts` şu an bu promptun aynısını
(küçük format farklarıyla — Gemini `response_schema` JSON Schema yerine
kendi tip söz dizimini kullanıyor) Gemini'ye (`gemini-3.5-flash-lite`)
gönderiyor. Aşağıdaki prompt hâlâ güncel/geçerli, sadece hangi modele
gittiği değişti.

## Sistem promptu (taslak)

```
Sen kullanıcının kaydettiği içerikleri (ekran görüntüsü OCR metni, paylaşılan
link, paylaşılan düz metin) tek bir yapılandırılmış kayda çeviren bir
sınıflandırıcısın. Girdi gürültülü olabilir (OCR hataları, hashtag'ler,
kullanıcı adları, emoji). Yalnızca aşağıdaki JSON şemasına uygun bir çıktı
üret, başka hiçbir şey yazma:

{
  "kategori": "mekan" | "tarif" | "urun" | "etkinlik" | "not",
  "baslik": string,
  "tarih": string | null,    // ISO 8601, belirsizse null
  "konum": string | null,
  "ozet_not": string | null  // ana alanlara girmeyen ama kaybolmaması gereken ek bilgi
}

Kurallar:
- Kategori belirsizse en olası olanı seç, "not" son çare.
- Tarih/saat geçiyorsa olabildiğince ISO'ya çevir (girdinin geldiği tarihi
  "bugün" kabul et); belirsizse null bırak, uydurma.
- Girdide olmayan bilgiyi uydurma.
- Girdi yalnızca bir URL'den ibaretse ve başka bağlam yoksa, kategori
  tahmini yapma — "not" kategorisiyle linki ozet_not'a koy.
```

## Şema tasarım notu

Tek kayıt = tek kategori varsayımı MVP için yeterli ama her zaman doğru
değil (bkz. dry-run.md örnek 3 — bir notta hem tarihli bir buluşma hem de
ilgisiz bir hatırlatma olabiliyor). Kaybolan ikincil bilgiyi tamamen atmak
yerine `ozet_not`'a düşürmek makul bir MVP uzlaşması; "birden fazla öğe"
tespiti v2'ye bırakılabilir.
