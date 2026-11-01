# Sharloop telefon uygulaması ve widget'lar: kurulum

Bu klasör Sharloop'u gerçek bir Android ve iOS uygulaması yapar ve ana ekrana
üç widget ekler:

| Widget | Ne gösterir | Dokununca |
| --- | --- | --- |
| **Sıradaki plan** | Emoji, plan adı, ne zaman ve nerede, kendi kendine akan geri sayım, kimlerin geldiği. Plan başlayınca dolan bir ilerleme çubuğu. | Planın sayfası açılır |
| **Şu an boşta** | Şu an boş olan arkadaşların yüzleri, yeşil halka ve "21:00'e kadar" gibi ne zamana kadar boş oldukları. | O arkadaşa bugün için plan daveti açılır |
| **Bugün geçmişte** | Geçen yıl (ya da geçen ay) bugünden bir anı fotoğrafı, yeri ve tarihi. | Anının olduğu sohbet açılır |

Uygulama, canlı siteyi (sharloop.vercel.app) açar. Yani siteye her deploy
uygulamaya da hemen gelir; mağazaya yeni sürüm göndermek sadece widget'lar
ya da uygulamanın kendisi değişince gerekir.

---

## Android (Windows bilgisayarında)

**Gerekenler:** [Node.js](https://nodejs.org) (zaten var) ve
[Android Studio](https://developer.android.com/studio). Android Studio'yu
kurup bir kez açın, "SDK" kurulumunu bitirsin.

1. Proje klasöründe terminal açın ve `mobile` klasörüne geçin:
   ```
   cd mobile
   npm install
   npm run add:android
   ```
   Bu, `android/` klasörünü oluşturur ve widget kodlarını içine yerleştirir.
2. `npm run open:android` ile Android Studio'da açın.
3. Telefonunuzu USB ile bağlayın (telefonda "Geliştirici seçenekleri" ve
   "USB hata ayıklama" açık olmalı) ve yeşil ▶ düğmesine basın.
4. Uygulamaya bir kez giriş yapın. Sonra ana ekranda boş bir yere basılı
   tutun → **Widget'lar** → **Sharloop** → üç widget'tan istediğinizi
   sürükleyin.

**Play Store için:** Android Studio'da *Build → Generate Signed App Bundle*.
Yeni bir imza anahtarı oluşturun ve bir yere yedekleyin (kaybolursa uygulama
bir daha güncellenemez). Paket adı `app.sharloop`; eski TWA uygulamasından
(`app.vercel.cepdost.twa`) ayrı bir uygulama olarak yüklenir.

## iOS (Mac gerekir)

**Gerekenler:** Bir Mac, App Store'dan **Xcode** (16 veya üstü) ve
widget'ların telefonda çalışması için bir **Apple Developer hesabı**
(yıllık 99 $; sadece kendi telefonunuzda denemek için ücretsiz Apple
kimliği de olur, ama uygulama 7 günde bir yeniden yüklenmeli).

1. Terminalde:
   ```
   cd mobile
   npm install
   npm run add:ios
   npm run open:ios
   ```
2. **Widget hedefini ekleyin (bir kez):** Xcode'da *File → New → Target… →
   Widget Extension*. Ad: `SharloopWidgets`. "Include Live Activity" ve
   "Include Configuration App Intent" kutularını **boş** bırakın. "Activate
   scheme" sorulursa **Activate** deyin.
3. Terminalde `npm run sync` çalıştırın: bizim widget dosyalarımız yeni
   hedefin klasörüne kopyalanır. Xcode'un kendi oluşturduğu
   `SharloopWidgets.swift` dosyasını silin (bizim `SharloopWidgetsBundle.swift`
   onun yerini alır). `SharloopWidgets` klasöründe şu dosyalar kalmalı:
   `SharloopWidgetsBundle.swift`, `Snapshot.swift`, `Theme.swift`,
   `NextPlanWidget.swift`, `FreeFriendsWidget.swift`, `OnThisDayWidget.swift`.
4. **App** klasörüne sağ tıklayın → *Add Files to "App"…* →
   `SharloopWidgetsPlugin.swift` ve `MainViewController.swift` dosyalarını
   seçin (hedef: App).
5. **App Group:** Sol üstte projeye tıklayın. Önce **App** hedefi, sonra
   **SharloopWidgets** hedefi için: *Signing & Capabilities → + Capability →
   App Groups* → `group.app.sharloop` ekleyin. İki hedefte de aynı grup
   işaretli olmalı. (Aynı ekranda "Team" olarak Apple hesabınızı seçin.)
6. **SharloopWidgets** hedefinde *General → Minimum Deployments* değerini
   **iOS 17.0** yapın (canlı geri sayım ve dokunulabilir widget için).
7. Telefonu bağlayın, üstten **App** şemasını seçin ve ▶ ile çalıştırın.
   Bir kez giriş yapın, sonra ana ekranda basılı tutun → **+** → Sharloop.

---

## Bilinmesi gerekenler

- **Bildirimler:** Telefon uygulamasının içinde tarayıcı bildirimleri
  (Web Push) çalışmaz. Uygulamada bildirim almak için Firebase (Android) ve
  Apple bildirim anahtarı (iOS) bağlantısı gerekiyor; bu bir sonraki adım.
  O zamana kadar bildirim için web sitesi / eski Android uygulaması da
  kullanılabilir.
- **Widget'lar ne zaman güncellenir:** Uygulama her açıldığında ve
  veriler değiştiğinde hemen. Uygulama kapalıyken: geri sayım her saniye
  kendi akar; "şu an boşta" listesi her çeyrek saatte arkadaşlarının dolu
  saatlerine göre yeniden hesaplanır; plan bitince sıradaki plana geçer.
  Yeni anı ve yeni arkadaş verisi için uygulamanın arada bir açılması gerekir.
- **Widget'lar yalnızca telefon uygulamasında vardır.** Web sitesinde ve
  PWA'da aynı üç kart **Planlar** sekmesinin en üstünde görünür.
- Yerel kodlar `native/` klasöründe durur; `npm run sync` her seferinde
  onları `android/` ve `ios/` içine yeniden kopyalar. Değişiklikleri
  `native/` içinde yapın.
