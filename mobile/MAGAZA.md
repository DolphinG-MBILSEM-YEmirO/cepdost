# Sharloop: App Store ve Google Play'e ilk yayın

Bu dosya mağaza formlarına kopyalanacak her şeyi bir arada tutar: uygulama
bilgileri, mağaza metinleri, gizlilik ve veri güvenliği cevapları, yaş sınırı,
inceleme notu ve imza anahtarı adımları. Uygulama kodu değiştikçe güncel
tutulmalı (özellikle "Veri güvenliği" bölümü `public/legal/privacy.html` ve
`mobile/native/ios/App/PrivacyInfo.xcprivacy` ile aynı şeyi söylemeli).

## 1. Uygulamanın kimliği

| Alan | Değer |
| --- | --- |
| Ad | Sharloop |
| Paket / Bundle ID | `app.sharloop` (widget: `app.sharloop.SharloopWidgets`) |
| SKU (Apple) | `sharloop` |
| Kategori | Sosyal Ağ (Social Networking); ikinci kategori: Yaşam Tarzı |
| Fiyat | Ücretsiz, uygulama içi satın alma yok |
| Reklam | Şimdilik yok ("Uygulamada reklam var mı?" → Hayır) |
| Cihaz | iOS: yalnızca iPhone (iPad ekran görüntüsü gerekmesin diye). Android: telefon |
| En düşük sürüm | iOS 17, Android 7 (API 24, Capacitor varsayılanı) |
| Gizlilik politikası | https://sharloop.vercel.app/legal/privacy.html |
| Kullanım şartları | https://sharloop.vercel.app/legal/terms.html |
| Hesap silme sayfası (Google) | https://sharloop.vercel.app/legal/delete-account.html |
| Destek e-postası | sharloop.destek@gmail.com |
| Destek sitesi (Apple) | https://sharloop.vercel.app/legal/terms.html |

## 2. Mağaza metinleri

### Türkçe

**Alt başlık (Apple, en çok 30 karakter):** Arkadaşlarınla plan kur

**Kısa açıklama (Google, en çok 80 karakter):** Arkadaşlarınla plan kur, mekân kaydet, anılarını paylaş. Hepsi tek yerde.

**Tanıtım metni (Apple, en çok 170 karakter):** Grubun planı hep yatıyor mu? Sharloop herkesin boş olduğu saati bulur, davetleri gönderir ve gittiğiniz yerleri anı olarak saklar.

**Anahtar kelimeler (Apple, en çok 100 karakter, virgülle):**
`plan,arkadaş,buluşma,etkinlik,davet,grup,mekan,takvim,anı,kafe,hafta sonu,ne yapsak`

**Açıklama:**

```
Sharloop, arkadaşlarınla plan yapmanın en kolay yolu.

PLAN KUR, HERKES GELSİN
• Bir plan kur, arkadaşlarını veya grubunu davet et; kim geliyor tek bakışta gör.
• Herkesin boş olduğu saati Sharloop bulsun, sen sadece onayla.
• Uygulaması olmayan arkadaşların bile tek bir linkle cevap verebilir.

KAYDET, UNUTMA
• Instagram'da, TikTok'ta gördüğün bir mekânı ya da etkinliği Sharloop'a paylaş; tarihiyle, yeriyle plana dönüşsün.
• Takvimin, hatırlatıcıların ve "bir gün gidelim" listen hep yanında.

GRUPLAR VE SOHBET
• Gruplar, sohbet, yanıtlama, emoji tepkileri, sabitleme ve daha fazlası.
• Grup planında kim ne getiriyor listesi.

ANILAR
• Gittiğin yerin fotoğraflarını ve videolarını puanıyla paylaş.
• Geçen yıl bugün nerede olduğunu ana ekran widget'ında gör.

ANA EKRAN WIDGET'LARI
• Sıradaki plan, şu an boşta olan arkadaşlar ve geçmişte bugün.

GİZLİLİK ÖNCE
• Mesajların ve planların uçtan uca şifrelenir; reklam için seni takip etmeyiz, verini satmayız.
• İstediğin kişiyi engelle, uygunsuz içeriği şikâyet et, hesabını istediğin an sil.

Sharloop 13 yaş ve üzeri içindir.
```

### English

**Subtitle:** Make plans with your friends

**Short description (Google):** Make plans with friends, save places, share memories. All in one place.

**Promotional text:** Does your group's plan always fall through? Sharloop finds the time everyone is free, sends the invites and keeps the places you went as memories.

**Keywords:** `plans,friends,meetup,hangout,events,invite,group,places,calendar,memories,weekend`

**Description:**

```
Sharloop is the easiest way to make plans with your friends.

MAKE A PLAN, GET EVERYONE THERE
• Create a plan, invite friends or a group, and see who's coming at a glance.
• Let Sharloop find the time everyone is free.
• Friends without the app can answer with a single link.

SAVE IT, DON'T FORGET IT
• Share a place or event you saw on Instagram or TikTok to Sharloop and it becomes a plan with its date and place.
• Your calendar, reminders and "let's go someday" list, always with you.

GROUPS AND CHAT
• Groups and chat with replies, reactions, pins and more.
• A "who brings what" list for group plans.

MEMORIES
• Share photos and videos of the places you went, with your rating.
• See where you were a year ago today in a home screen widget.

HOME SCREEN WIDGETS
• Next plan, friends who are free right now, and on this day.

PRIVACY FIRST
• Messages and plans are end-to-end encrypted. No ad tracking, no selling your data.
• Block anyone, report inappropriate content, delete your account any time.

Sharloop is for people aged 13 and over.
```

## 3. Görseller

| Ne | Ölçü | Not |
| --- | --- | --- |
| Uygulama simgesi | 1024×1024 (Apple), 512×512 (Google) | `public/icons/icon-512.png`; Apple'a derlemeyle birlikte gider |
| iPhone ekran görüntüleri | 1320×2868 (6,9 inç), 3-10 adet | Apple yalnızca en büyük boyutu istiyor, küçükleri ondan üretiyor |
| Android telefon ekran görüntüleri | En az 1080 piksel genişlik, 2-8 adet | |
| Google öne çıkan görsel | 1024×500 | Simge + "Paylaş. Planla. Birlikte yaşa." |

**Hazır:** `mobile/store-assets/` (1.0.0 için çekildi):

| Klasör | İçerik |
| --- | --- |
| `iphone/tr/1-6.jpg`, `iphone/en/1-6.jpg` | 1320×2868, App Store'a sırayla yüklenecek |
| `android/tr/1-6.jpg`, `android/en/1-6.jpg` | 1080×2160, Play Console'a yüklenecek |
| `android/feature-graphic-tr.jpg`, `-en.jpg` | 1024×500 öne çıkan görsel |

Sıra: 1. Bütün planların tek yerde, 2. Kimin geldiğini anında gör, 3. Grubunla
planla, 4. Arkadaşların ne zaman müsait, 5. Gittiğin yerleri paylaş, 6. Ayın özeti.
Görüntülerdeki kişiler ve paylaşımlar demo hesaplardır (Elif, Can, Deniz, Ece,
Mert); fotoğraflar çizimdir. Gerçek fotoğraf eklemek ya da arayüz değişince
yeniden çekmek için: `mobile/store-assets/README.md`.

## 4. Apple: App Privacy (Uygulama Gizliliği) cevapları

"Veri topluyor musunuz?" → **Evet**. Takip (tracking) → **Hayır**, hiçbir veri
türü takip için kullanılmıyor. Her tür için amaç: **Uygulama İşlevselliği**.

| Veri türü | Kullanıcıya bağlı mı? | Not |
| --- | --- | --- |
| İletişim bilgisi → Ad | Evet | Profil adı |
| İletişim bilgisi → E-posta adresi | Evet | Hesap doğrulama |
| Kullanıcı içeriği → Fotoğraflar veya videolar | Evet | Anılar, paylaşımlar |
| Kullanıcı içeriği → Diğer kullanıcı içeriği | Evet | Mesajlar, planlar, yorumlar |
| Tanımlayıcılar → Kullanıcı kimliği | Evet | Hesabın açık anahtarı, kullanıcı adı |
| Konum → Yaklaşık konum | Hayır | Sadece yakındaki mekân önerisi için, saklanmıyor |

## 5. Google Play: Veri güvenliği (Data safety) cevapları

- Veri topluyor veya paylaşıyor mu? → **Evet, topluyor**. Paylaşım (üçüncü
  taraflara aktarım) → **Hayır** (yalnızca hizmet sağlayıcılar, bu "paylaşım" sayılmıyor).
- Aktarım sırasında şifreli mi? → **Evet**.
- Kullanıcı verilerinin silinmesini isteyebilir mi? → **Evet**: uygulama içinden
  ve `https://sharloop.vercel.app/legal/delete-account.html`.

| Kategori → tür | Toplanıyor | Zorunlu mu | Amaç |
| --- | --- | --- | --- |
| Kişisel bilgiler → Ad | Evet | Zorunlu | Uygulama işlevselliği, hesap yönetimi |
| Kişisel bilgiler → E-posta adresi | Evet | Zorunlu | Hesap yönetimi, dolandırıcılığı önleme |
| Kişisel bilgiler → Kullanıcı kimlikleri | Evet | Zorunlu | Uygulama işlevselliği |
| Fotoğraflar ve videolar → Fotoğraflar, Videolar | Evet | İsteğe bağlı | Uygulama işlevselliği |
| Mesajlar → Diğer uygulama içi mesajlar | Evet | İsteğe bağlı | Uygulama işlevselliği |
| Uygulama etkinliği → Kullanıcı tarafından oluşturulan diğer içerikler | Evet | İsteğe bağlı | Uygulama işlevselliği |
| Konum → Yaklaşık konum | Evet (işlenip saklanmıyor: "geçici işleme" işaretlenebilir) | İsteğe bağlı | Uygulama işlevselliği |

## 6. Yaş sınırı ve içerik derecelendirmesi

- **Apple yaş derecelendirmesi anketi:** Kullanıcı tarafından oluşturulan içerik:
  **Evet**. Kullanıcılar arası mesajlaşma: **Evet**. Şiddet, cinsellik, kumar,
  alkol, uyuşturucu: **Yok**. İçerik denetimi (şikâyet/engelleme): **Evet**.
  Beklenen sonuç: **13+**.
- **Google içerik derecelendirmesi (IARC):** Kategori "Sosyal veya iletişim";
  kullanıcılar etkileşime giriyor ve içerik paylaşıyor: **Evet**. Beklenen sonuç:
  **Genç / PEGI 12**.
- **Google hedef kitle:** 13-15, 16-17 ve 18+ seçilmeli; 13 yaş altı
  **seçilmemeli** (seçilirse Aileler programı kuralları devreye girer).

## 7. Apple inceleme notu (App Review Information)

**Demo hesap:** Kullanıcı adı `developer_01`, şifre: (buraya
değil, yalnızca App Store Connect'e yazılacak). Bu hesabın e-postası doğrulanmış,
en az bir arkadaşı, bir grubu, birkaç planı ve anısı olmalı.

```
Sharloop is a social planning app. Sign in with the demo account above
("Zaten hesabım var" -> username + password).

Native features: three home screen widgets (Next plan, Free friends,
On this day) built with WidgetKit, sharloop:// deep links from the
widgets into the app, and "Telefon takvimine ekle" on any plan, which
opens the system New Event sheet (EventKitUI) filled in with the plan.

User-generated content safeguards (Guideline 1.2):
- Report: long-press a message -> "Şikâyet et"; the flag icon on a
  memory card; "Şikâyet et" at the bottom of a person's profile.
- Block: "Engelle" on a person's profile or group member card, or the
  checkbox in the report sheet. Blocked users' content is hidden.
- Reports reach our moderators by email and are reviewed within 24 hours.
- Terms of use with a no-objectionable-content policy are linked on the
  sign-up screen.

Account deletion (Guideline 5.1.1(v)): Profil -> Ayarlar -> Hesap
güvenliği -> "Hesabımı kalıcı olarak sil".

The app's interface is in Turkish.
```

## 8. Android imza anahtarı (yükleme anahtarı)

Google Play'e giden her paket aynı **yükleme anahtarıyla** imzalanmalı. Google
"Play Uygulama İmzalama" ile asıl anahtarı kendisi saklar; yükleme anahtarı
kaybolursa Play Console'dan sıfırlatılabilir, yine de yedeklenmeli.

1. Bilgisayarda (Java veya Android Studio kuruluysa) terminalde:
   ```
   keytool -genkeypair -v -keystore sharloop-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Şifre sorar, ad-soyad gibi bilgileri ister (gerçek ad gerekmez).
2. Dosyayı base64 metne çevirin (PowerShell):
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("sharloop-upload.jks")) | Set-Clipboard
   ```
3. GitHub → depo → *Settings → Secrets and variables → Actions → New repository secret*:

   | Ad | Değer |
   | --- | --- |
   | `ANDROID_UPLOAD_KEYSTORE` | 2. adımda kopyalanan metin |
   | `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | anahtar deposunun şifresi |
   | `ANDROID_UPLOAD_KEY_ALIAS` | `upload` |
   | `ANDROID_UPLOAD_KEY_PASSWORD` | anahtarın şifresi (aynıysa aynısı) |

4. Actions → **Android release** → *Run workflow*. Bitince sayfanın altındaki
   `Sharloop-aab-N` dosyasını indirip Play Console'a yükleyin.
5. `sharloop-upload.jks` dosyasını ve şifresini güvenli bir yere (ör. bir USB
   bellek ve şifre yöneticisi) yedekleyin. Depoya **asla** eklemeyin
   (`.gitignore` zaten engelliyor).

## 9. Google Play'de ilk yayın sırası

1. Play Console'da uygulama oluştur: ad Sharloop, dil Türkçe, ücretsiz, uygulama.
2. *Uygulama içeriği* bölümündeki formlar: gizlilik politikası, reklam yok,
   uygulama erişimi (inceleme hesabı bilgisi), içerik derecelendirmesi, hedef
   kitle, veri güvenliği, hesap silme bağlantısı.
3. *Test → Kapalı test*: bir test kanalı aç, imzalı `.aab` dosyasını yükle, en az
   **12 test kullanıcısının** e-postasını ekle. Kişisel geliştirici hesaplarında
   üretime çıkmadan önce bu 12 kişinin **14 gün** boyunca uygulamayı yüklü
   tutması zorunlu.
4. 14 gün dolunca *Üretim erişimi için başvur* → onay → üretim sürümü.

## 10. App Store'da ilk yayın sırası

1. `mobile/KURULUM.md`'deki TestFlight adımları (geliştirici hesabı, App Store
   Connect'te uygulama, API anahtarı, dört GitHub sırrı).
2. App Store Connect → Sharloop → *Uygulama Bilgileri*: kategori, yaş anketi,
   gizlilik politikası adresi. *Uygulama Gizliliği*: 4. bölümdeki cevaplar.
3. *iOS uygulaması 1.0*: ekran görüntüleri, metinler (2. bölüm), destek adresi,
   derleme olarak TestFlight'taki son sürüm, inceleme notu ve demo hesap (7. bölüm).
4. Şifreleme sorusu çıkarsa: uygulama yalnızca standart şifreleme kullanıyor
   (Info.plist'te `ITSAppUsesNonExemptEncryption = NO` zaten var).
5. *İncelemeye gönder*. İnceleme genelde 1-3 gün sürer.

## 11. Sürüm notları (1.0.0)

Sürüm numarası tek yerde: `mobile/package.json` → `version`. Android
(`versionName`) ve iOS (`MARKETING_VERSION`) derlemeleri oradan okur; derleme
numarası her GitHub çalıştırmasında otomatik artar. Sonraki sürümde yalnızca
bu sayıyı yükselt (ör. 1.0.1 hata düzeltmesi, 1.1.0 yeni özellik).

**Türkçe (Yenilikler):**

```
Sharloop'un ilk sürümü!
• Arkadaşlarınla plan kur, davet gönder, kimin geldiğini anında gör
• Grup sohbetlerinde grup planı yap, herkes tek dokunuşla yanıtlasın
• Herkese uyan saati Sharloop bulsun
• Gittiğin yerleri fotoğraf ve puanla paylaş
• Ana ekran widget'ları: sıradaki plan, müsait arkadaşlar, geçen yıl bugün
• Planları tek dokunuşla telefonunun takvimine ekle
```

**English (What's New):**

```
The first version of Sharloop!
• Make plans with friends, send invites and see who's coming
• Plan with your group right in the chat; everyone answers with one tap
• Let Sharloop find a time that suits everyone
• Share the places you love with photos and ratings
• Home screen widgets: next plan, free friends, on this day
• Add any plan to your phone's calendar with one tap
```
