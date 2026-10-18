import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useSohbetTemasi, type SohbetTemasi } from '../sohbetTema'

// F18 — grup sohbeti ve birebir sohbetin ortak gövdesi: temalı zemin,
// baloncuklar, animasyonlar. İki ekran da aynı görünüme sahip olsun diye
// tek yerde tutuluyor; tema değişince ikisi birden değişiyor.

export function SohbetZemini({
  tema,
  children,
  className = '',
}: {
  tema: SohbetTemasi
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`relative flex-1 overflow-y-auto ${tema.zemin} ${className}`}>
      {/* Desen ayrı bir katmanda: içerik üstünde kalsın ve kaydırmayla
          birlikte hareket etmesin diye sabit konumlu. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: tema.desen }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

// Mesaj baloncuğu. `yeni` true ise giriş animasyonu oynar — ilk yüklemede
// tüm geçmiş aynı anda zıplamasın diye sadece sonradan gelenlerde açılıyor.
// `ek` (a plan card) sits under the bubble, on the same side.
export function Baloncuk({
  benim,
  yeni,
  gonderenAd,
  zaman,
  ek,
  children,
}: {
  benim: boolean
  yeni?: boolean
  gonderenAd?: string | null
  zaman?: string
  ek?: ReactNode
  children: ReactNode
}) {
  const tema = useSohbetTemasi()

  return (
    <div
      className={`flex ${benim ? 'justify-end' : 'justify-start'} ${
        yeni ? (benim ? 'animate-bubble-in-right' : 'animate-bubble-in-left') : ''
      }`}
    >
      <div className="max-w-[80%] min-w-0">
        {!benim && gonderenAd && (
          <p className="text-[11px] font-semibold text-ink-400 mb-1 px-1 truncate">{gonderenAd}</p>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            benim
              ? `${tema.benim} ${tema.benimMetin} rounded-br-md`
              : `${tema.karsi} ${tema.karsiMetin} rounded-bl-md`
          }`}
        >
          {children}
        </div>
        {ek && <div className={`mt-1.5 flex ${benim ? 'justify-end' : 'justify-start'}`}>{ek}</div>}
        {zaman && (
          <p
            className={`text-[10px] text-ink-300 mt-0.5 px-1 ${benim ? 'text-right' : 'text-left'}`}
          >
            {zaman}
          </p>
        )}
      </div>
    </div>
  )
}

// Gönder butonu: gönderilirken dönen ikon, boşken sönük.
export function GonderButonu({
  onClick,
  gonderiliyor,
  pasif,
}: {
  onClick: () => void
  gonderiliyor: boolean
  pasif: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={gonderiliyor || pasif}
      aria-label="Gönder"
      className="w-11 h-11 rounded-full bg-coral-500 text-white flex items-center justify-center active:scale-90 transition-all disabled:opacity-40 shrink-0"
    >
      <Icon
        name={gonderiliyor ? 'Loader2' : 'Send'}
        className={`w-5 h-5 ${gonderiliyor ? 'animate-spin' : ''}`}
      />
    </button>
  )
}

// Yeni mesaj gelince en alta kaydır. İlk yüklemede animasyonsuz atlıyoruz —
// açılışta sayfanın kayarak gitmesi tuhaf duruyor.
export function useSonaKaydir(bagimliliklar: unknown[]) {
  const ref = useRef<HTMLDivElement>(null)
  const ilkRef = useRef(true)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: ilkRef.current ? 'auto' : 'smooth' })
    ilkRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, bagimliliklar)

  return ref
}

// Hangi mesajın animasyonla gireceğine karar verir.
//
// Basit bir "ilk yükleme bitti mi" bayrağı YETMİYOR: bayrak kalkınca bir
// sonraki render'da TÜM baloncuklar animasyon sınıfını alıyor ve geçmiş
// baştan zıplıyor (canlı testte görüldü). Bunun yerine ilk yüklemedeki en
// yeni mesajın zaman damgasını eşik alıyoruz — sadece ondan sonrakiler yeni.
//
// Eşik sunucunun kendi zaman damgalarından geliyor, istemci saatinden değil;
// böylece saat kayması yanlış sonuç üretmiyor.
export function useYeniMesajEsigi(
  mesajlar: Array<{ olusturulma: string }>,
  hazir: boolean,
): (olusturulma: string) => boolean {
  const esikRef = useRef<string | null>(null)

  useEffect(() => {
    if (!hazir || esikRef.current !== null) return
    // Boş sohbette eşik '' olur; ilk yazılan mesaj da animasyonla girer.
    esikRef.current = mesajlar.reduce((en, m) => (m.olusturulma > en ? m.olusturulma : en), '')
  }, [hazir, mesajlar])

  return (olusturulma: string) => esikRef.current !== null && olusturulma > esikRef.current
}
