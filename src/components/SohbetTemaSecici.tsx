import { Icon } from './Icon'
import { TEMALAR, temayiYaz, useSohbetTemasi } from '../sohbetTema'
import { useGeriIleKapat } from '../lib/geriTusu'

// Sohbet ekranının başlığındaki hızlı seçici — kullanıcı temayı görmek
// istediği yerde, Ayarlar'a gitmeden değiştirebilsin.
export function TemaSheet({ onKapat }: { onKapat: () => void }) {
  const secili = useSohbetTemasi()
  useGeriIleKapat(onKapat)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/40 animate-fade-in"
      onClick={onKapat}
    >
      <div
        className="w-full max-w-md bg-mist-50 rounded-t-3xl p-5 pb-[calc(1.25rem+var(--safe-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-ink-200 mx-auto mb-4" />
        <h3 className="font-semibold text-ink-700 mb-1">Sohbet teması</h3>
        <p className="text-xs text-ink-400 mb-4">Sadece senin ekranında değişir.</p>

        <div className="grid grid-cols-6 gap-2">
          {TEMALAR.map((t) => {
            const aktif = t.id === secili.id
            return (
              <button
                key={t.id}
                onClick={() => temayiYaz(t.id)}
                aria-label={`${t.ad} teması`}
                aria-pressed={aktif}
                className="flex flex-col items-center gap-1.5 active:opacity-80 transition-transform"
              >
                <span
                  className={`w-11 h-11 rounded-2xl ${t.onizleme} flex items-center justify-center ${
                    aktif ? 'ring-2 ring-offset-2 ring-orchid-500 ring-offset-mist-50' : ''
                  }`}
                >
                  {aktif && <Icon name="Check" className="w-4 h-4 text-white" />}
                </span>
                <span
                  className={`text-[10px] leading-tight text-center ${
                    aktif ? 'text-ink-700 font-semibold' : 'text-ink-400'
                  }`}
                >
                  {t.ad}
                </span>
              </button>
            )
          })}
        </div>

        <button onClick={onKapat} className="btn-ghost w-full mt-5 border border-ink-100">
          Tamam
        </button>
      </div>
    </div>
  )
}

// Tema seçimi cihaza özel — karşı taraf senin temanı görmüyor. Bu yüzden
// önizleme, seçimin gerçekte nasıl görüneceğini birebir gösteriyor.
export function SohbetTemaSecici() {
  const secili = useSohbetTemasi()

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-orchid-100 flex items-center justify-center">
          <Icon name="MessagesSquare" className="w-5 h-5 text-orchid-500" />
        </div>
        <h2 className="font-semibold text-ink-700">Sohbet teması</h2>
      </div>

      <p className="text-sm text-ink-400 mb-4">
        Baloncuk renkleri ve zemin. Yalnızca senin ekranında değişir — karşı taraf
        kendi temasını görür.
      </p>

      {/* Canlı önizleme */}
      <div
        className={`rounded-2xl p-4 mb-4 space-y-2 relative overflow-hidden ${secili.zemin}`}
      >
        <div aria-hidden className="absolute inset-0" style={{ background: secili.desen }} />
        <div className="relative flex justify-start">
          <div
            className={`max-w-[75%] rounded-2xl rounded-bl-md px-3.5 py-2 text-xs ${secili.karsi} ${secili.karsiMetin}`}
          >
            Cumartesi müsait misin?
          </div>
        </div>
        <div className="relative flex justify-end">
          <div
            className={`max-w-[75%] rounded-2xl rounded-br-md px-3.5 py-2 text-xs ${secili.benim} ${secili.benimMetin}`}
          >
            Müsaitim, saat kaçta?
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {TEMALAR.map((t) => {
          const aktif = t.id === secili.id
          return (
            <button
              key={t.id}
              onClick={() => temayiYaz(t.id)}
              aria-label={`${t.ad} teması`}
              aria-pressed={aktif}
              className="flex flex-col items-center gap-1.5 active:opacity-80 transition-transform"
            >
              <span
                className={`w-10 h-10 rounded-2xl ${t.onizleme} flex items-center justify-center ${
                  aktif ? 'ring-2 ring-offset-2 ring-orchid-500 ring-offset-mist-50' : ''
                }`}
              >
                {aktif && <Icon name="Check" className="w-4 h-4 text-white" />}
              </span>
              <span
                className={`text-[10px] leading-tight text-center ${
                  aktif ? 'text-ink-700 font-semibold' : 'text-ink-400'
                }`}
              >
                {t.ad}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
