import { useEffect, useRef } from 'react'

// Tek bir uzun input yerine hane başına kutu. Tek <input> kullanıp
// üstüne kutu çizmek yerine gerçek ayrı inputlar tercih edildi: mobil
// klavyede SMS otomatik doldurma (autocomplete="one-time-code") ilk
// input'a bağlandığında tarayıcı tüm haneleri kendisi dağıtabiliyor.
interface Props {
  uzunluk?: number
  deger: string
  onDegisim: (yeni: string) => void
  // Tüm haneler dolunca otomatik gönder — kullanıcıya ayrıca butona
  // basma yükü bindirmemek için.
  onTamamlandi?: (kod: string) => void
  devreDisi?: boolean
}

export function KodKutulari({
  uzunluk = 6,
  deger,
  onDegisim,
  onTamamlandi,
  devreDisi = false,
}: Props) {
  const referanslar = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    referanslar.current[0]?.focus()
  }, [])

  const haneler = Array.from({ length: uzunluk }, (_, i) => deger[i] ?? '')

  function haneyiYaz(index: number, girilen: string) {
    const rakamlar = girilen.replace(/\D/g, '')
    if (!rakamlar) return

    // Yapıştırma veya otomatik doldurma: tek kutuya birden çok hane
    // gelebilir, hepsini bu kutudan itibaren dağıt.
    const parcalar = deger.split('')
    for (let i = 0; i < rakamlar.length && index + i < uzunluk; i++) {
      parcalar[index + i] = rakamlar[i]
    }
    const yeni = parcalar.join('').slice(0, uzunluk)
    onDegisim(yeni)

    const sonrakiOdak = Math.min(index + rakamlar.length, uzunluk - 1)
    referanslar.current[sonrakiOdak]?.focus()

    if (yeni.length === uzunluk && !yeni.includes(' ')) {
      onTamamlandi?.(yeni)
    }
  }

  function tusaBasildi(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const parcalar = deger.split('')
      if (parcalar[index]) {
        // Dolu kutuyu boşalt, odak kalsın.
        parcalar[index] = ''
        onDegisim(parcalar.join('').trimEnd())
      } else if (index > 0) {
        // Boş kutuda geri tuşu: önceki kutuya dön ve onu boşalt.
        parcalar[index - 1] = ''
        onDegisim(parcalar.join('').trimEnd())
        referanslar.current[index - 1]?.focus()
      }
      return
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      referanslar.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < uzunluk - 1) {
      e.preventDefault()
      referanslar.current[index + 1]?.focus()
    }
  }

  function yapistir(e: React.ClipboardEvent<HTMLInputElement>) {
    const metin = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, uzunluk)
    if (!metin) return
    e.preventDefault()
    onDegisim(metin)
    referanslar.current[Math.min(metin.length, uzunluk - 1)]?.focus()
    if (metin.length === uzunluk) onTamamlandi?.(metin)
  }

  return (
    <div className="flex justify-center gap-2" dir="ltr">
      {haneler.map((hane, i) => (
        <input
          key={i}
          ref={(el) => {
            referanslar.current[i] = el
          }}
          value={hane}
          onChange={(e) => haneyiYaz(i, e.target.value)}
          onKeyDown={(e) => tusaBasildi(i, e)}
          onPaste={yapistir}
          onFocus={(e) => e.target.select()}
          disabled={devreDisi}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`${i + 1}. hane`}
          className={`w-11 h-14 rounded-2xl border text-center text-2xl font-bold text-ink-700
            bg-cream-100 transition-all focus:outline-none focus:ring-2 focus:ring-coral-300
            disabled:opacity-50
            ${hane ? 'border-coral-300 bg-cream-50' : 'border-ink-100/60'}`}
        />
      ))}
    </div>
  )
}
