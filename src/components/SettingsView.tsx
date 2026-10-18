import { Icon } from './Icon'
import { TakvimAyarlari } from './TakvimAyarlari'
import { SohbetTemaSecici } from './SohbetTemaSecici'

// Not: Hallet referansındaki "Gemini API Anahtarı" kartı buraya bilerek
// taşınmadı. Sınıflandırma sunucu-taraflı bir secret ile çalışıyor
// (bkz. supabase/functions/classify) — kullanıcı hiçbir zaman bir API
// anahtarı görmüyor/girmiyor, bu CepDost'un "sıfır kurulum" ilkesi.

export function SettingsView({ onDegisti }: { onDegisti?: () => void } = {}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <h1 className="font-display text-2xl font-bold text-ink-700">Ayarlar</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
              <Icon name="Info" className="w-5 h-5 text-teal-600" />
            </div>
            <h2 className="font-semibold text-ink-700">Nasıl çalışır?</h2>
          </div>
          <div className="space-y-3 text-sm text-ink-500">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-coral-100 text-coral-600 font-bold text-xs flex items-center justify-center shrink-0">1</span>
              <p>Bir link, ekran görüntüsü veya not paylaş — uygulama içinden ya da telefonun paylaş menüsünden.</p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-coral-100 text-coral-600 font-bold text-xs flex items-center justify-center shrink-0">2</span>
              <p>İçeriği okuyup kategori, başlık, tarih, saat ve öncelik çıkarır — sen hiçbir şey yazmazsın, hiçbir API anahtarı girmezsin.</p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-coral-100 text-coral-600 font-bold text-xs flex items-center justify-center shrink-0">3</span>
              <p>Arşivde arar, hatırlatır, harita bağlantısı verir. Kaydettiğin şey nihayet işe yarasın.</p>
            </div>
          </div>
        </div>

        <SohbetTemaSecici />

        <TakvimAyarlari onDegisti={onDegisti} />

        <div className="card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Icon name="Share2" className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="font-semibold text-ink-700">Paylaş menüsüne ekle</h2>
          </div>
          <p className="text-sm text-ink-400">
            Uygulamayı ana ekrana ekle, sonra herhangi bir yerden paylaş menüsünde "CepDost" görünecek. Reel, TikTok, ekran görüntüsü — hepsi direkt arşive.
          </p>
          <p className="text-xs text-ink-300 mt-3">
            Chrome'da sağ üstteki ⋮ menüsünden "Ana ekrana ekle" seçeneğini seç.
          </p>
        </div>

        <div className="text-center pt-2">
          <p className="text-xs text-ink-300">CepDost · Faz 0 MVP</p>
          <p className="text-xs text-ink-300 mt-1">Kaydettiğin şey nihayet işe yarasın.</p>
        </div>
      </div>
    </div>
  )
}
