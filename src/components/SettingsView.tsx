import { Icon } from './Icon'
import { TakvimAyarlari } from './TakvimAyarlari'
import { SohbetTemaSecici } from './SohbetTemaSecici'
import { HesapGuvenligi } from './HesapGuvenligi'
import { BildirimAyarlari } from './BildirimAyarlari'
import { SLOGAN, UYGULAMA_ADI } from '../../shared/marka'
import { yerelUygulamada } from '../lib/platform'

// Not: Hallet referansındaki "Gemini API Anahtarı" kartı buraya bilerek
// taşınmadı. Sınıflandırma sunucu-taraflı bir secret ile çalışıyor
// (bkz. api/classify.ts) — kullanıcı hiçbir zaman bir API anahtarı
// görmüyor/girmiyor, bu uygulamanın "sıfır kurulum" ilkesi.

export function SettingsView({ onDegisti }: { onDegisti?: () => void } = {}) {
  // The store app has no share-menu entry or Home Screen step (see below).
  const yerel = yerelUygulamada()
  return (
    <div className="flex flex-col h-full">
      <h2 className="sr-only">Ayarlar</h2>
      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-24 lg:px-0 flex flex-col gap-6 lg:block lg:pb-10 lg:columns-2 lg:[&>*]:break-inside-avoid lg:[&>*]:mb-6">
        <BildirimAyarlari />

        <HesapGuvenligi />

        <SohbetTemaSecici />

        <TakvimAyarlari onDegisti={onDegisti} />

        {/* Adding the web app to the Home Screen puts it in the share menu
            (Web Share Target); the store app is already installed. */}
        {!yerel && (
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center">
                <Icon name="Share2" className="w-5 h-5 text-bolum-koyu" />
              </div>
              <h2 className="font-semibold text-ink-700">Paylaş menüsüne ekle</h2>
            </div>
            <p className="text-sm text-ink-400">
              Uygulamayı ana ekrana ekle, sonra herhangi bir yerden paylaş menüsünde "{UYGULAMA_ADI}" görünecek. Reel, TikTok, ekran görüntüsü — hepsi direkt arşive.
            </p>
            <p className="text-xs text-ink-400 mt-3">
              Chrome'da sağ üstteki ⋮ menüsünden "Ana ekrana ekle" seçeneğini seç.
            </p>
          </div>
        )}

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center">
              <Icon name="Info" className="w-5 h-5 text-bolum-koyu" />
            </div>
            <h2 className="font-semibold text-ink-700">Nasıl çalışır?</h2>
          </div>
          <div className="space-y-3 text-sm text-ink-500">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-bolum text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
              <p>Arkadaşlarını Sohbet → Arkadaşlar'dan kullanıcı adıyla ekle.</p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-bolum text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
              <p>+ ile plan kur ya da asistana yaz ("Cumartesi Ayşe'yle kahvaltı"); herkesin boş olduğu saati bulur, davetleri gönderir.</p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-bolum text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
              <p>
                {yerel
                  ? "Bir linki Profil → Arşiv'deki \"Link ekle\" ile kaydet; saatiyle, yeriyle plana dönüşür, Arşiv'de kalır."
                  : "Bir link ya da ekran görüntüsünü paylaş menüsünden gönder; saatiyle, yeriyle plana dönüşür, Arşiv'de kalır."}
              </p>
            </div>
          </div>
        </div>

        <div className="text-center pt-2">
          <p className="text-caption font-medium text-ink-500">{UYGULAMA_ADI}</p>
          <p className="text-caption font-normal text-ink-400 mt-0.5">{SLOGAN}</p>
          <p className="text-caption text-ink-400 mt-2 flex justify-center gap-3">
            <a href="/legal/privacy.html" target="_blank" rel="noopener" className="underline">
              Gizlilik
            </a>
            <a href="/legal/terms.html" target="_blank" rel="noopener" className="underline">
              Kullanım Şartları
            </a>
            <a href="mailto:sharloop.destek@gmail.com" className="underline">
              Destek
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
