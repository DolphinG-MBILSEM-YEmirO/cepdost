import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { Avatar, GrupAvatari } from './Avatar'
import { Baloncuk, GonderButonu } from './SohbetGovde'
import {
  HIZLI_TEPKILER,
  TUM_TEPKILER,
  kartliMi,
  mesajOzeti,
  type MesajIslemleri,
  type SohbetMesaji,
} from './useMesajIslemleri'
import { formatMessageTime } from '../lib/format'
import { useGeriIleKapat } from '../lib/geriTusu'
import { sohbetleriGetir, type Sohbet } from '../sosyal/mesajlar'
import { SikayetSayfasi } from './SikayetSayfasi'
import { duzenlenebilirMi, mesajBilgisi, type MesajBilgisi, type SohbetHedefi } from '../sosyal/mesajIslemleri'

// WhatsApp-style message actions, shared by the direct chat and the group
// chat. A message opens its menu on right-click, on a long-press, or from
// the options button that shows on hover; swiping it right answers it.
//
//   MesajSatiri      one message: gestures, quote, reactions, ticks
//   SohbetUstSeridi  the pinned message and the starred ones, above the chat
//   MesajYazmaAlani  the composer, with the reply and edit bars
//   MesajKatmanlari  the menu, the sheets and the short notes
//
// Their state lives in useMesajIslemleri.ts.

const UZUN_BASMA_MS = 450
const KAYDIRMA_ESIGI = 56
const AZAMI_ILETME = 5

// ---------- one message ----------

export function MesajSatiri({
  mesaj,
  islemler,
  yeni,
  gonderenAd,
  ek,
  okunduGoster = false,
}: {
  mesaj: SohbetMesaji
  islemler: MesajIslemleri
  yeni: boolean
  // Group chats name the sender above others' messages.
  gonderenAd?: string | null
  // A plan card under the bubble.
  ek?: ReactNode
  // Direct chats: ticks on my messages.
  okunduGoster?: boolean
}) {
  const benim = mesaj.gonderen_id === islemler.benimId
  const icRef = useRef<HTMLDivElement>(null)
  const okRef = useRef<HTMLDivElement>(null)
  const dokunma = useRef<{
    x: number
    y: number
    dx: number
    yon: 'yatay' | 'dikey' | null
    zamanlayici: number
    uzunBasildi: boolean
  } | null>(null)
  // Android also fires contextmenu on a long-press; that one opens the sheet.
  const sonDokunma = useRef(0)

  function kaydirmayiBirak() {
    if (icRef.current) {
      icRef.current.style.transition = 'transform 0.2s'
      icRef.current.style.transform = ''
    }
    if (okRef.current) okRef.current.style.opacity = '0'
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    sonDokunma.current = Date.now()
    const zamanlayici = window.setTimeout(() => {
      const d = dokunma.current
      if (!d || d.yon) return
      d.uzunBasildi = true
      navigator.vibrate?.(12)
      islemler.menuAc(mesaj, null)
    }, UZUN_BASMA_MS)
    dokunma.current = { x: t.clientX, y: t.clientY, dx: 0, yon: null, zamanlayici, uzunBasildi: false }
  }

  function onTouchMove(e: TouchEvent) {
    const d = dokunma.current
    if (!d || d.uzunBasildi) return
    const t = e.touches[0]
    const dx = t.clientX - d.x
    const dy = t.clientY - d.y
    if (!d.yon && Math.hypot(dx, dy) > 10) {
      window.clearTimeout(d.zamanlayici)
      d.yon = dx > Math.abs(dy) && !mesaj.silindi ? 'yatay' : 'dikey'
    }
    if (d.yon !== 'yatay' || !icRef.current) return
    d.dx = Math.max(0, Math.min(dx, 90))
    icRef.current.style.transition = 'none'
    icRef.current.style.transform = `translateX(${d.dx}px)`
    if (okRef.current) okRef.current.style.opacity = String(Math.min(1, d.dx / KAYDIRMA_ESIGI))
  }

  function onTouchEnd(e: TouchEvent) {
    const d = dokunma.current
    dokunma.current = null
    if (!d) return
    window.clearTimeout(d.zamanlayici)
    // The menu is open: the finger lifting must not also tap what's under it.
    if (d.uzunBasildi) e.preventDefault()
    if (d.yon !== 'yatay') return
    kaydirmayiBirak()
    if (d.dx >= KAYDIRMA_ESIGI) {
      navigator.vibrate?.(8)
      islemler.yanitla(mesaj)
    }
  }

  const durum = (
    <>
      {mesaj.duzenlendi && <span>· düzenlendi</span>}
      {mesaj.yildizli && (
        <span title="Yıldızlı" aria-label="Yıldızlı">
          <Icon name="Star" className="w-3 h-3 fill-amber-400 text-amber-400" />
        </span>
      )}
      {benim && okunduGoster && !mesaj.silindi && (
        <span title={mesaj.okundu ? 'Okundu' : 'Gönderildi'} aria-label={mesaj.okundu ? 'Okundu' : 'Gönderildi'}>
          <Icon
            name={mesaj.okundu ? 'CheckCheck' : 'Check'}
            className={`w-3.5 h-3.5 ${mesaj.okundu ? 'text-brand-600' : 'text-ink-400'}`}
          />
        </span>
      )}
    </>
  )

  return (
    <div className="relative" data-mesaj-id={mesaj.id}>
      {/* Shows up from the left while the message is swiped to answer it. */}
      <div
        ref={okRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-mist-50 shadow-sm flex items-center justify-center opacity-0"
      >
        <Icon name="Reply" className="w-4 h-4 text-brand-600" />
      </div>
      <Baloncuk
        benim={benim}
        yeni={yeni}
        gonderenAd={gonderenAd}
        zaman={formatMessageTime(mesaj.olusturulma) ?? undefined}
        silindi={mesaj.silindi}
        vurgulu={islemler.vurgulanan === mesaj.id}
        icRef={icRef}
        satir={{
          className: 'group mesaj-satiri',
          style: { touchAction: 'pan-y pinch-zoom' },
          onContextMenu: (e) => {
            e.preventDefault()
            islemler.menuAc(mesaj, Date.now() - sonDokunma.current < 1000 ? null : { x: e.clientX, y: e.clientY })
          },
          onTouchStart,
          onTouchMove,
          onTouchEnd,
          onTouchCancel: onTouchEnd,
        }}
        ust={
          !mesaj.silindi && (mesaj.iletildi || mesaj.yanit) ? (
            <>
              {mesaj.iletildi && (
                <span className="flex items-center gap-1 text-[11px] italic opacity-75 mb-1">
                  <Icon name="Forward" className="w-3.5 h-3.5" />
                  İletildi
                </span>
              )}
              {mesaj.yanit && <Alinti yanit={mesaj.yanit} islemler={islemler} />}
            </>
          ) : undefined
        }
        alt={mesaj.silindi ? undefined : <TepkiRozeti mesaj={mesaj} islemler={islemler} />}
        durum={durum}
        ek={ek}
        secenekler={
          <button
            type="button"
            aria-label="Mesaj seçenekleri"
            aria-haspopup="menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              islemler.menuAc(mesaj, { x: r.left, y: r.bottom + 4 })
            }}
            className="shrink-0 w-7 h-7 rounded-full bg-mist-50/95 border border-ink-100 text-ink-400 hover:text-ink-600 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity [@media(hover:none)]:hidden"
          >
            <Icon name="ChevronDown" className="w-4 h-4" />
          </button>
        }
      >
        {mesaj.silindi ? (
          <span className="inline-flex items-center gap-1.5">
            <Icon name="Ban" className="w-3.5 h-3.5" />
            {benim ? 'Bu mesajı sildin' : 'Bu mesaj silindi'}
          </span>
        ) : (
          mesaj.metin
        )}
      </Baloncuk>
    </div>
  )
}

function Alinti({ yanit, islemler }: { yanit: NonNullable<SohbetMesaji['yanit']>; islemler: MesajIslemleri }) {
  // The original as it is now when it's loaded (edited or deleted since),
  // else the copy the reply carries.
  const asil = islemler.mesajBul(yanit.id)
  return (
    <button
      type="button"
      onClick={() => islemler.mesajaGit(yanit.id)}
      className="mesaj-alinti block w-full min-w-[8rem] text-left rounded-lg px-2.5 py-1.5 mb-1.5"
    >
      <span className="block text-[11px] font-semibold truncate">{islemler.adAl(yanit.gonderen_id)}</span>
      <span className="block text-xs opacity-80 line-clamp-2 whitespace-normal">
        {asil ? mesajOzeti(asil) : yanit.metin || 'Plan'}
      </span>
    </button>
  )
}

function TepkiRozeti({ mesaj, islemler }: { mesaj: SohbetMesaji; islemler: MesajIslemleri }) {
  if (mesaj.tepkiler.length === 0) return null
  const emojiler = [...new Set(mesaj.tepkiler.map((t) => t.emoji))].slice(0, 3)
  const benimki = mesaj.tepkiler.some((t) => t.kullanici_id === islemler.benimId)
  return (
    <button
      type="button"
      onClick={() => islemler.tepkileriAc(mesaj)}
      aria-label={`${mesaj.tepkiler.length} tepki: ${emojiler.join(' ')}. Kimlerin bıraktığını gör`}
      className={`relative z-[1] inline-flex items-center gap-1 rounded-full bg-mist-50 border px-1.5 py-0.5 text-sm leading-none shadow-sm active:opacity-80 transition-transform ${
        benimki ? 'border-brand-300' : 'border-ink-100'
      }`}
    >
      <span>{emojiler.join('')}</span>
      {mesaj.tepkiler.length > 1 && (
        <span className="text-[11px] font-semibold text-ink-500">{mesaj.tepkiler.length}</span>
      )}
    </button>
  )
}

// ---------- pinned and starred, above the chat ----------

export function SohbetUstSeridi({ islemler }: { islemler: MesajIslemleri }) {
  const sabit = islemler.sabitId ? islemler.mesajBul(islemler.sabitId) : null
  const sabitGorunur = sabit && !sabit.silindi ? sabit : null
  const yildizli = islemler.mesajlar.filter((m) => m.yildizli && !m.silindi).length
  if (!sabitGorunur && yildizli === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-ink-100 bg-mist-50/90 shrink-0">
      {sabitGorunur ? (
        <>
          <button
            type="button"
            onClick={() => islemler.mesajaGit(sabitGorunur.id)}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left rounded-xl -m-1 p-1 hover:bg-ink-50 transition-colors"
          >
            <Icon name="Pin" className="w-4 h-4 text-brand-600 shrink-0" />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-brand-600">Sabitlenen mesaj</span>
              <span className="block text-xs text-ink-500 truncate">
                {islemler.adAl(sabitGorunur.gonderen_id)}: {mesajOzeti(sabitGorunur)}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => islemler.sabitDegistir(null)}
            aria-label="Sabitlemeyi kaldır"
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 active:opacity-80 transition shrink-0"
          >
            <Icon name="PinOff" className="w-4 h-4" />
          </button>
        </>
      ) : (
        <div className="flex-1" />
      )}
      {yildizli > 0 && (
        <button
          type="button"
          onClick={islemler.yildizlilariAc}
          aria-label={`Yıldızlı mesajlar: ${yildizli}`}
          className="chip bg-amber-50 text-amber-700 text-xs py-1 shrink-0"
        >
          <Icon name="Star" className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          {yildizli}
        </button>
      )}
    </div>
  )
}

// ---------- composer ----------

export function MesajYazmaAlani({ islemler, onPlanPaylas }: { islemler: MesajIslemleri; onPlanPaylas: () => void }) {
  const { yanitlanan, duzenlenen } = islemler
  useGeriIleKapat(islemler.yazmaCubugunuKapat, !!(yanitlanan || duzenlenen))

  return (
    <div className="px-4 pb-[calc(1rem+var(--safe-bottom))] pt-3 border-t border-ink-100 safe-x shrink-0 bg-mist-100">
      {(yanitlanan || duzenlenen) && (
        <div className="flex items-center gap-2 mb-2 rounded-2xl bg-mist-50 border border-ink-100 pl-3 pr-1.5 py-2 animate-slide-up">
          <Icon name={duzenlenen ? 'Pencil' : 'Reply'} className="w-4 h-4 text-brand-600 shrink-0" />
          <div className="flex-1 min-w-0 border-l-[3px] border-brand-400 pl-2.5">
            <p className="text-[11px] font-semibold text-brand-600 truncate">
              {duzenlenen ? 'Mesajı düzenle' : `${islemler.adAl(yanitlanan!.gonderen_id)} · yanıtla`}
            </p>
            <p className="text-xs text-ink-500 truncate">{mesajOzeti((duzenlenen ?? yanitlanan)!)}</p>
          </div>
          <button
            type="button"
            onClick={islemler.yazmaCubugunuKapat}
            aria-label={duzenlenen ? 'Düzenlemeyi bırak' : 'Yanıtı bırak'}
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-50 active:opacity-80 transition shrink-0"
          >
            <Icon name="X" className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={onPlanPaylas}
          aria-label="Plan paylaş"
          className="w-11 h-11 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center active:opacity-80 transition-transform shrink-0"
        >
          <Icon name="CalendarPlus" className="w-5 h-5" />
        </button>
        <textarea
          ref={islemler.alanRef}
          value={islemler.girdi}
          onChange={(e) => islemler.setGirdi(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void islemler.gonderVeyaKaydet()
            }
          }}
          placeholder={duzenlenen ? 'Mesajı düzenle...' : 'Mesaj yaz...'}
          aria-label={duzenlenen ? 'Mesajı düzenle' : 'Mesaj yaz'}
          rows={1}
          className="flex-1 bg-white border border-ink-200 rounded-xl px-4 py-2.5 text-ink-700 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all resize-none max-h-32"
        />
        <GonderButonu
          onClick={() => void islemler.gonderVeyaKaydet()}
          gonderiliyor={islemler.gonderiliyor}
          pasif={!islemler.girdi.trim()}
        />
      </div>
    </div>
  )
}

// ---------- menu and sheets ----------

export function MesajKatmanlari({ islemler }: { islemler: MesajIslemleri }) {
  const { menu, silinecek, iletilen, bilgisi, tepkileri } = islemler
  const [sikayetEdilen, setSikayetEdilen] = useState<SohbetMesaji | null>(null)
  const sikayetEt = (mesaj: SohbetMesaji) => {
    islemler.menuKapat()
    setSikayetEdilen(mesaj)
  }
  return createPortal(
    <>
      {menu &&
        (menu.konum ? (
          <YuzenMenu key={menu.mesaj.id} konum={menu.konum} onKapat={islemler.menuKapat}>
            <MenuIcerigi mesaj={menu.mesaj} islemler={islemler} onSikayet={sikayetEt} />
          </YuzenMenu>
        ) : (
          <AltSayfa key={menu.mesaj.id} onKapat={islemler.menuKapat} etiket="Mesaj seçenekleri">
            <p className="text-sm text-ink-600 line-clamp-3 whitespace-pre-wrap break-words bg-mist-100 rounded-2xl px-3.5 py-2.5 mb-3">
              {mesajOzeti(menu.mesaj)}
            </p>
            <MenuIcerigi mesaj={menu.mesaj} islemler={islemler} onSikayet={sikayetEt} buyuk />
          </AltSayfa>
        ))}
      {silinecek && <SilmeSayfasi mesaj={silinecek} islemler={islemler} />}
      {iletilen && <IletmeSayfasi mesaj={iletilen} islemler={islemler} />}
      {bilgisi && <BilgiSayfasi mesaj={bilgisi} islemler={islemler} />}
      {tepkileri && <TepkiSayfasi mesaj={tepkileri} islemler={islemler} />}
      {islemler.yildizlilarAcik && <YildizliSayfasi islemler={islemler} />}
      {sikayetEdilen && (
        <SikayetSayfasi
          hedef={{
            tur: 'mesaj',
            kisiId: sikayetEdilen.gonderen_id,
            ad: islemler.adAl(sikayetEdilen.gonderen_id),
            metin: sikayetEdilen.metin || null,
            icerikId: sikayetEdilen.id,
          }}
          onKapat={() => setSikayetEdilen(null)}
        />
      )}
      {islemler.bildiri && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 top-[calc(5rem+var(--safe-top))] z-[90] max-w-[90vw] rounded-full bg-ink-800/90 text-white text-sm px-4 py-2 shadow-lg animate-fade-in"
        >
          {islemler.bildiri}
        </div>
      )}
    </>,
    document.body,
  )
}

interface MenuOgesi {
  ad: string
  ikon: IconName
  tehlikeli?: boolean
  yap: () => void
}

function menuOgeleri(mesaj: SohbetMesaji, islemler: MesajIslemleri, onSikayet: (m: SohbetMesaji) => void): MenuOgesi[] {
  const benim = mesaj.gonderen_id === islemler.benimId
  const kartli = kartliMi(mesaj)
  const sil: MenuOgesi = { ad: 'Sil', ikon: 'Trash2', tehlikeli: true, yap: () => islemler.silmeyiSor(mesaj) }
  if (mesaj.silindi) return [sil]
  const ogeler: MenuOgesi[] = [{ ad: 'Yanıtla', ikon: 'Reply', yap: () => islemler.yanitla(mesaj) }]
  if (mesaj.metin) ogeler.push({ ad: 'Kopyala', ikon: 'Copy', yap: () => islemler.kopyala(mesaj) })
  if (mesaj.metin && !kartli) ogeler.push({ ad: 'İlet', ikon: 'Forward', yap: () => islemler.iletmeyiAc(mesaj) })
  const sabit = islemler.sabitId === mesaj.id
  ogeler.push({
    ad: sabit ? 'Sabitlemeyi kaldır' : 'Sabitle',
    ikon: sabit ? 'PinOff' : 'Pin',
    yap: () => islemler.sabitDegistir(mesaj),
  })
  ogeler.push({
    ad: mesaj.yildizli ? 'Yıldızı kaldır' : 'Yıldızla',
    ikon: mesaj.yildizli ? 'StarOff' : 'Star',
    yap: () => islemler.yildizDegistir(mesaj),
  })
  if (benim) ogeler.push({ ad: 'Bilgi', ikon: 'Info', yap: () => islemler.bilgiyiAc(mesaj) })
  else ogeler.push({ ad: 'Şikâyet et', ikon: 'Flag', tehlikeli: true, yap: () => onSikayet(mesaj) })
  if (benim && !kartli && duzenlenebilirMi(mesaj)) {
    ogeler.push({ ad: 'Düzenle', ikon: 'Pencil', yap: () => islemler.duzenle(mesaj) })
  }
  ogeler.push(sil)
  return ogeler
}

function MenuIcerigi({
  mesaj,
  islemler,
  onSikayet,
  buyuk = false,
}: {
  mesaj: SohbetMesaji
  islemler: MesajIslemleri
  onSikayet: (m: SohbetMesaji) => void
  buyuk?: boolean
}) {
  const [tumEmojiler, setTumEmojiler] = useState(false)
  const benimTepkim = mesaj.tepkiler.find((t) => t.kullanici_id === islemler.benimId)?.emoji ?? null
  const ilkRef = useRef<HTMLButtonElement>(null)

  // Keyboard users land in the menu.
  useEffect(() => {
    ilkRef.current?.focus({ preventScroll: true })
  }, [])

  const emojiDugmesi = (emoji: string) => (
    <button
      key={emoji}
      type="button"
      onClick={() => islemler.tepkiSec(mesaj, emoji)}
      aria-label={`${emoji} bırak`}
      aria-pressed={benimTepkim === emoji}
      className={`${buyuk ? 'w-11 h-11 text-2xl' : 'w-9 h-9 text-xl'} rounded-full flex items-center justify-center hover:bg-ink-50 active:opacity-80 transition ${
        benimTepkim === emoji ? 'bg-brand-100' : ''
      }`}
    >
      {emoji}
    </button>
  )

  return (
    <div role="menu" aria-label="Mesaj seçenekleri">
      {!mesaj.silindi &&
        (tumEmojiler ? (
          <div className="mb-1">
            <div className="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto p-1">{TUM_TEPKILER.map(emojiDugmesi)}</div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-0.5 p-1 mb-1">
            {HIZLI_TEPKILER.map(emojiDugmesi)}
            <button
              type="button"
              onClick={() => setTumEmojiler(true)}
              aria-label="Başka bir emoji seç"
              className={`${buyuk ? 'w-11 h-11' : 'w-9 h-9'} rounded-full bg-ink-50 text-ink-500 flex items-center justify-center hover:bg-ink-100 active:opacity-80 transition`}
            >
              <Icon name="SmilePlus" className="w-5 h-5" />
            </button>
          </div>
        ))}
      <div className={!mesaj.silindi ? 'border-t border-ink-100 pt-1' : ''}>
        {menuOgeleri(mesaj, islemler, onSikayet).map((o, i) => (
          <button
            key={o.ad}
            ref={i === 0 ? ilkRef : undefined}
            type="button"
            role="menuitem"
            onClick={o.yap}
            className={`w-full flex items-center gap-3 rounded-xl px-3 ${buyuk ? 'py-3' : 'py-2'} text-sm text-left hover:bg-ink-50 focus-visible:bg-ink-50 focus:outline-none transition-colors ${
              o.tehlikeli ? 'text-rose-600' : 'text-ink-700'
            }`}
          >
            <Icon name={o.ikon} className={`w-[18px] h-[18px] ${o.tehlikeli ? 'text-rose-500' : 'text-ink-400'}`} />
            {o.ad}
          </button>
        ))}
      </div>
    </div>
  )
}

// Right-click and the options button: a small menu at the pointer, kept
// inside the window.
function YuzenMenu({ konum, onKapat, children }: { konum: { x: number; y: number }; onKapat: () => void; children: ReactNode }) {
  useGeriIleKapat(onKapat)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // offset sizes: the opening animation scales the box down for a moment.
    const width = el.offsetWidth
    const height = el.offsetHeight
    el.style.left = `${Math.max(8, Math.min(konum.x, window.innerWidth - width - 8))}px`
    el.style.top = `${konum.y + height > window.innerHeight - 8 ? Math.max(8, konum.y - height) : konum.y}px`
    el.style.visibility = 'visible'
  }, [konum.x, konum.y])

  return (
    <div
      className="fixed inset-0 z-[80]"
      onClick={onKapat}
      onContextMenu={(e) => {
        e.preventDefault()
        onKapat()
      }}
    >
      <div
        ref={ref}
        style={{ visibility: 'hidden', left: konum.x, top: konum.y }}
        className="fixed w-64 bg-mist-50 rounded-2xl shadow-xl border border-ink-100 p-1.5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// Long-press and the other sheets: up from the bottom, like the app's others.
function AltSayfa({
  onKapat,
  etiket,
  baslik,
  children,
}: {
  onKapat: () => void
  etiket: string
  baslik?: string
  children: ReactNode
}) {
  useGeriIleKapat(onKapat)
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-900/40 animate-fade-in"
      onClick={onKapat}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={etiket}
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-mist-50 rounded-t-3xl p-4 pb-[calc(1rem+var(--safe-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-ink-200 mx-auto mb-3" />
        {baslik && <h3 className="font-semibold text-ink-700 mb-3 px-1">{baslik}</h3>}
        {children}
      </div>
    </div>
  )
}

function SilmeSayfasi({ mesaj, islemler }: { mesaj: SohbetMesaji; islemler: MesajIslemleri }) {
  const herkestenOlur = mesaj.gonderen_id === islemler.benimId && !mesaj.silindi && !kartliMi(mesaj)
  return (
    <AltSayfa onKapat={islemler.silmeyiKapat} etiket="Mesajı sil" baslik="Mesaj silinsin mi?">
      <p className="text-sm text-ink-400 mb-4 px-1">
        {herkestenOlur
          ? '“Herkesten sil” mesajı sohbetteki herkes için kaldırır; yerinde “Bu mesaj silindi” yazar.'
          : 'Mesaj yalnızca senin cihazlarından kaldırılır; diğerleri görmeye devam eder.'}
      </p>
      <div className="space-y-2">
        {herkestenOlur && (
          <button
            type="button"
            onClick={() => islemler.sil(mesaj, true)}
            className="w-full rounded-2xl bg-rose-50 text-rose-700 font-semibold px-4 py-3 active:opacity-80 transition"
          >
            Herkesten sil
          </button>
        )}
        <button
          type="button"
          onClick={() => islemler.sil(mesaj, false)}
          className="w-full rounded-2xl bg-ink-50 text-ink-700 font-semibold px-4 py-3 active:opacity-80 transition"
        >
          Benden sil
        </button>
        <button type="button" onClick={islemler.silmeyiKapat} className="btn-ghost w-full">
          Vazgeç
        </button>
      </div>
    </AltSayfa>
  )
}

function sohbetHedefi(s: Sohbet): SohbetHedefi {
  return { tur: s.tur, id: s.id }
}

function IletmeSayfasi({ mesaj, islemler }: { mesaj: SohbetMesaji; islemler: MesajIslemleri }) {
  const [sohbetler, setSohbetler] = useState<Sohbet[] | null>(null)
  const [secili, setSecili] = useState<string[]>([])
  const [arama, setArama] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)

  useEffect(() => {
    let iptal = false
    sohbetleriGetir()
      .then((liste) => {
        if (!iptal) setSohbetler(liste)
      })
      .catch(() => {
        if (!iptal) setSohbetler([])
      })
    return () => {
      iptal = true
    }
  }, [])

  const anahtar = (s: Sohbet) => `${s.tur}:${s.id}`
  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr-TR')
    return (sohbetler ?? []).filter(
      (s) => !q || s.ad.toLocaleLowerCase('tr-TR').includes(q) || s.kullaniciAdi?.toLocaleLowerCase('tr-TR').includes(q),
    )
  }, [sohbetler, arama])

  function degistir(s: Sohbet) {
    const k = anahtar(s)
    setSecili((liste) => (liste.includes(k) ? liste.filter((x) => x !== k) : liste.length < AZAMI_ILETME ? [...liste, k] : liste))
  }

  async function gonder() {
    const hedefler = (sohbetler ?? []).filter((s) => secili.includes(anahtar(s))).map(sohbetHedefi)
    if (hedefler.length === 0) return
    setGonderiliyor(true)
    await islemler.ilet(mesaj, hedefler)
    setGonderiliyor(false)
  }

  return (
    <AltSayfa onKapat={islemler.iletmeyiKapat} etiket="Mesajı ilet" baslik="İlet">
      <p className="text-sm text-ink-500 bg-mist-100 rounded-2xl px-3.5 py-2.5 mb-3 line-clamp-2">{mesaj.metin}</p>
      <input
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        placeholder="Kişi veya grup ara"
        aria-label="Kişi veya grup ara"
        className="input-field mb-2"
      />
      <p className="text-[11px] text-ink-400 px-1 mb-1">En fazla {AZAMI_ILETME} sohbet seçebilirsin.</p>
      <div className="max-h-72 overflow-y-auto -mx-1">
        {sohbetler === null ? (
          <div className="flex justify-center py-6">
            <Icon name="Loader2" className="w-5 h-5 animate-spin text-ink-400" />
          </div>
        ) : gorunen.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Sohbet bulunamadı.</p>
        ) : (
          gorunen.map((s) => {
            const secildi = secili.includes(anahtar(s))
            return (
              <button
                key={anahtar(s)}
                type="button"
                role="checkbox"
                aria-checked={secildi}
                onClick={() => degistir(s)}
                className="w-full flex items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-ink-50 transition-colors"
              >
                {s.grup ? (
                  <GrupAvatari grup={s.grup} boyut="sm" />
                ) : (
                  <Avatar ad={s.ad} foto={s.avatar} emoji={s.profil?.emoji} renk={s.profil?.renk} boyut="sm" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink-700 truncate">{s.ad}</span>
                  <span className="block text-xs text-ink-400 truncate">
                    {s.tur === 'grup' ? 'Grup' : s.kullaniciAdi ? `@${s.kullaniciAdi}` : ''}
                  </span>
                </span>
                <span
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    secildi ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-200'
                  }`}
                >
                  {secildi && <Icon name="Check" className="w-3.5 h-3.5" />}
                </span>
              </button>
            )
          })
        )}
      </div>
      <button
        type="button"
        onClick={() => void gonder()}
        disabled={secili.length === 0 || gonderiliyor}
        className="btn-primary w-full mt-3 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Icon name={gonderiliyor ? 'Loader2' : 'Forward'} className={`w-4 h-4 ${gonderiliyor ? 'animate-spin' : ''}`} />
        {secili.length > 1 ? `${secili.length} sohbete ilet` : 'İlet'}
      </button>
    </AltSayfa>
  )
}

function BilgiSayfasi({ mesaj, islemler }: { mesaj: SohbetMesaji; islemler: MesajIslemleri }) {
  const [bilgi, setBilgi] = useState<MesajBilgisi | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const { hedef } = islemler

  useEffect(() => {
    let iptal = false
    mesajBilgisi(hedef, mesaj)
      .then((b) => {
        if (!iptal) setBilgi(b)
      })
      .catch((err) => {
        if (!iptal) setHata(err instanceof Error ? err.message : 'Bilgi alınamadı')
      })
    return () => {
      iptal = true
    }
  }, [hedef, mesaj])

  const liste = (baslik: string, kisiler: string[], ikon: IconName, renk: string) =>
    kisiler.length > 0 && (
      <div className="mb-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 px-1 mb-1.5">
          <Icon name={ikon} className={`w-4 h-4 ${renk}`} />
          {baslik}
        </p>
        <ul className="rounded-2xl bg-mist-100 divide-y divide-ink-100">
          {kisiler.map((pk) => (
            <li key={pk} className="px-3.5 py-2.5 text-sm text-ink-700 truncate">
              {islemler.adAl(pk)}
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <AltSayfa onKapat={islemler.bilgiyiKapat} etiket="Mesaj bilgisi" baslik="Mesaj bilgisi">
      <p className="text-sm text-ink-600 bg-mist-100 rounded-2xl px-3.5 py-2.5 mb-3 line-clamp-3 whitespace-pre-wrap break-words">
        {mesajOzeti(mesaj)}
      </p>
      <p className="text-xs text-ink-400 px-1 mb-3">
        Gönderildi: {formatMessageTime(mesaj.olusturulma)}
        {mesaj.duzenlendi && ` · Düzenlendi: ${formatMessageTime(mesaj.duzenlendi)}`}
      </p>
      {hata ? (
        <p className="text-sm text-rose-600 px-1">{hata}</p>
      ) : !bilgi ? (
        <div className="flex justify-center py-4">
          <Icon name="Loader2" className="w-5 h-5 animate-spin text-ink-400" />
        </div>
      ) : (
        <>
          {liste('Okudu', bilgi.okuyanlar, 'CheckCheck', 'text-brand-600')}
          {liste('Henüz okumadı', bilgi.bekleyenler, 'Check', 'text-ink-400')}
        </>
      )}
    </AltSayfa>
  )
}

function TepkiSayfasi({ mesaj, islemler }: { mesaj: SohbetMesaji; islemler: MesajIslemleri }) {
  // Mine first, as in WhatsApp, so it's easy to take back.
  const tepkiler = [...mesaj.tepkiler].sort(
    (a, b) => Number(b.kullanici_id === islemler.benimId) - Number(a.kullanici_id === islemler.benimId),
  )
  return (
    <AltSayfa onKapat={islemler.tepkileriKapat} etiket="Tepkiler" baslik={`Tepkiler · ${tepkiler.length}`}>
      {tepkiler.length === 0 ? (
        <p className="text-sm text-ink-400 text-center py-4">Tepki kalmadı.</p>
      ) : (
        <ul className="space-y-1">
          {tepkiler.map((t) => {
            const benim = t.kullanici_id === islemler.benimId
            return (
              <li key={t.kullanici_id}>
                <button
                  type="button"
                  disabled={!benim}
                  onClick={() => islemler.tepkiSec(mesaj, null)}
                  className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left enabled:hover:bg-ink-50 transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink-700 truncate">{islemler.adAl(t.kullanici_id)}</span>
                    {benim && <span className="block text-xs text-ink-400">Kaldırmak için dokun</span>}
                  </span>
                  <span className="text-2xl">{t.emoji}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </AltSayfa>
  )
}

function YildizliSayfasi({ islemler }: { islemler: MesajIslemleri }) {
  const yildizlilar = islemler.mesajlar.filter((m) => m.yildizli && !m.silindi)
  return (
    <AltSayfa onKapat={islemler.yildizlilariKapat} etiket="Yıldızlı mesajlar" baslik="Yıldızlı mesajlar">
      {yildizlilar.length === 0 ? (
        <p className="text-sm text-ink-400 text-center py-4">Yıldızlı mesaj yok.</p>
      ) : (
        <ul className="space-y-2">
          {yildizlilar.map((m) => (
            <li key={m.id} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => {
                  islemler.yildizlilariKapat()
                  islemler.mesajaGit(m.id)
                }}
                className="flex-1 min-w-0 text-left rounded-2xl bg-mist-100 px-3.5 py-2.5 hover:bg-ink-50 transition-colors"
              >
                <span className="flex items-center justify-between gap-2 text-[11px] text-ink-400 mb-0.5">
                  <span className="font-semibold text-ink-500 truncate">{islemler.adAl(m.gonderen_id)}</span>
                  <span className="shrink-0">{formatMessageTime(m.olusturulma)}</span>
                </span>
                <span className="block text-sm text-ink-700 line-clamp-3 whitespace-pre-wrap break-words">{mesajOzeti(m)}</span>
              </button>
              <button
                type="button"
                onClick={() => islemler.yildizDegistir(m)}
                aria-label="Yıldızı kaldır"
                className="w-9 h-9 rounded-full flex items-center justify-center text-amber-500 hover:bg-amber-50 active:opacity-80 transition shrink-0"
              >
                <Icon name="StarOff" className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </AltSayfa>
  )
}
