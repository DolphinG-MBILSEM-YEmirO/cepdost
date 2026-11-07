import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { qrSvg } from './MekanSayfasi'
import { motor, motorVarMi, useSosyalSurum } from '../sosyal/cekirdek'
import {
  AZAMI_ISLETME_FOTO,
  isletmeFotoUrl,
  isletmemiGetir,
  isletmemiKaydet,
  isletmemiSil,
  type IsletmeFotosu,
  type IsletmeProfili,
} from '../sosyal/isletme'
import { konumAl } from '../lib/yakin'
import { useGeriIleKapat } from '../lib/geriTusu'
import { SITE_ADRESI } from '../../shared/marka'
import { dogrulamaAdresi } from '../../shared/yakinMekanlar'

// Settings card for businesses: a free public profile (photos, contact,
// hours, description, a discount for people who come through the app)
// that shows when the place comes up in the feed's "Yakınında", plus the
// page the till uses to check customers' discount codes.

const DESTEK = 'sharloop.destek@gmail.com'
const TURLER = ['Kafe', 'Restoran', 'Tatlıcı', 'Fırın', 'Kahvaltı', 'Dondurmacı', 'Kitap kafe', 'Müze', 'Sinema', 'Oyun ve eğlence', 'Spor', 'Diğer']

export function IsletmeKarti() {
  const [acik, setAcik] = useState(false)
  const [profil, setProfil] = useState<IsletmeProfili | null | undefined>(undefined)
  const surum = useSosyalSurum()
  useGeriIleKapat(() => setAcik(false), acik)

  useEffect(() => {
    if (!motorVarMi()) return
    void isletmemiGetir()
      .then(setProfil)
      .catch(() => setProfil(null))
  }, [surum, acik])

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center">
          <Icon name="Store" className="w-5 h-5 text-bolum-koyu" />
        </div>
        <h2 className="font-semibold text-ink-700">İşletme hesabı</h2>
      </div>
      <p className="text-sm text-ink-400 mb-4">
        {profil
          ? `${profil.ad} profilin yayında. Yakındaki Sharloop kullanıcıları fotoğraflarını, iletişim bilgilerini ve indirimini görüyor.`
          : 'Bir mekanın varsa ücretsiz işletme profili aç: fotoğrafların, saatlerin ve indirimin yakındaki Sharloop kullanıcılarına görünsün.'}
      </p>
      <button onClick={() => setAcik(true)} className="w-full btn-ghost border border-ink-100 flex items-center justify-center gap-2 text-sm">
        <Icon name={profil ? 'Pencil' : 'Plus'} className="w-4 h-4" />
        {profil ? 'İşletme profilini düzenle' : 'İşletme profili aç'}
      </button>

      {acik && profil !== undefined && (
        <div className="panel-tam z-[60]">
          <div className="h-full overflow-y-auto">
            <IsletmePaneli profil={profil} onKapat={() => setAcik(false)} onDegisti={setProfil} />
          </div>
        </div>
      )}
    </div>
  )
}

function MevcutFoto({ profil, foto, onKaldir }: { profil: IsletmeProfili; foto: IsletmeFotosu; onKaldir: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    void isletmeFotoUrl(profil, foto).then(setUrl).catch(() => {})
  }, [profil, foto])
  return <FotoKutusu url={url} onKaldir={onKaldir} />
}

function YeniFoto({ dosya, onKaldir }: { dosya: Blob; onKaldir: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(dosya)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [dosya])
  return <FotoKutusu url={url} onKaldir={onKaldir} />
}

function FotoKutusu({ url, onKaldir }: { url: string | null; onKaldir: () => void }) {
  return (
    <div className="relative w-24 h-24 shrink-0">
      {url ? <img src={url} alt="" className="w-full h-full rounded-2xl object-cover" /> : <div className="skeleton w-full h-full rounded-2xl" />}
      <button
        type="button"
        onClick={onKaldir}
        aria-label="Fotoğrafı kaldır"
        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-ink-800 text-white flex items-center justify-center shadow"
      >
        <Icon name="X" className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function Alan({ etiket, ipucu, children }: { etiket: string; ipucu?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-600">{etiket}</span>
      {ipucu && <span className="block text-xs text-ink-400 mt-0.5">{ipucu}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

const GIRDI = 'w-full rounded-2xl border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-700 focus:outline-none focus:border-bolum'

function IsletmePaneli({
  profil,
  onKapat,
  onDegisti,
}: {
  profil: IsletmeProfili | null
  onKapat: () => void
  onDegisti: (p: IsletmeProfili | null) => void
}) {
  const [ad, setAd] = useState(profil?.ad ?? '')
  const [kategori, setKategori] = useState(profil?.kategori ?? '')
  const [aciklama, setAciklama] = useState(profil?.aciklama ?? '')
  const [adres, setAdres] = useState(profil?.adres ?? '')
  const [konum, setKonum] = useState<{ enlem: number; boylam: number } | null>(
    profil ? { enlem: profil.enlem, boylam: profil.boylam } : null,
  )
  const [konumMetni, setKonumMetni] = useState(profil ? `${profil.enlem}, ${profil.boylam}` : '')
  const [telefon, setTelefon] = useState(profil?.telefon ?? '')
  const [web, setWeb] = useState(profil?.web ?? '')
  const [instagram, setInstagram] = useState(profil?.instagram ?? '')
  const [saatler, setSaatler] = useState(profil?.saatler ?? '')
  const [korunan, setKorunan] = useState<IsletmeFotosu[]>(profil?.fotolar ?? [])
  const [yeniler, setYeniler] = useState<Blob[]>([])
  const [indirimAcik, setIndirimAcik] = useState(!!profil?.indirim)
  const [indirimMetni, setIndirimMetni] = useState(profil?.indirim?.metin ?? '')
  const [indirimKosulu, setIndirimKosulu] = useState(profil?.indirim?.kosul ?? '')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [kaydedildi, setKaydedildi] = useState(false)
  const [kapatOnay, setKapatOnay] = useState(false)
  const [konumAliniyor, setKonumAliniyor] = useState(false)
  const dosyaGirdisi = useRef<HTMLInputElement>(null)
  const fotoSayisi = korunan.length + yeniler.length

  async function buradayim() {
    setKonumAliniyor(true)
    const k = await konumAl(10_000)
    setKonumAliniyor(false)
    if (typeof k === 'string') {
      setHata(k === 'izin-yok' ? 'Konum izni kapalı. Konumu Google Haritalar\'dan kopyalayıp yapıştırabilirsin.' : 'Konum bulunamadı.')
      return
    }
    setKonum(k)
    setKonumMetni(`${k.enlem.toFixed(6)}, ${k.boylam.toFixed(6)}`)
  }

  // "40.987, 29.025" pasted from Google Maps (right click on the pin).
  function konumYazildi(metin: string) {
    setKonumMetni(metin)
    const m = metin.match(/(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)/)
    setKonum(m ? { enlem: Number(m[1]), boylam: Number(m[2]) } : null)
  }

  async function kaydet(e: React.FormEvent) {
    e.preventDefault()
    if (!konum) {
      setHata('Mekanın konumunu ekle: mekandaysan "Buradayım"a dokun ya da Google Haritalar\'daki koordinatları yapıştır.')
      return
    }
    setKaydediliyor(true)
    setHata(null)
    try {
      const yeni = await isletmemiKaydet(
        {
          ad,
          kategori,
          aciklama,
          adres,
          enlem: konum.enlem,
          boylam: konum.boylam,
          telefon,
          web,
          instagram,
          saatler,
          indirim: indirimAcik && indirimMetni.trim() ? { metin: indirimMetni, kosul: indirimKosulu || null } : null,
        },
        { koru: korunan, yeni: yeniler },
      )
      setKorunan(yeni.fotolar)
      setYeniler([])
      onDegisti(yeni)
      setKaydedildi(true)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi. İnternet bağlantını kontrol et.')
    } finally {
      setKaydediliyor(false)
    }
  }

  async function profiliKapat() {
    setKapatOnay(false)
    try {
      await isletmemiSil()
      onDegisti(null)
      onKapat()
    } catch {
      setHata('Profil kapatılamadı. Tekrar dene.')
    }
  }

  const benimId = motorVarMi() ? motor().benimId : ''
  const dogrulama = dogrulamaAdresi(SITE_ADRESI, benimId)

  return (
    <div className="max-w-lg mx-auto px-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onKapat} aria-label="Geri" className="w-10 h-10 rounded-full flex items-center justify-center text-ink-600 hover:bg-ink-50">
          <Icon name="ChevronLeft" className="w-5 h-5" />
        </button>
        <h2 className="font-semibold text-ink-700 text-lg">İşletme profili</h2>
      </div>

      <form onSubmit={(e) => void kaydet(e)} className="flex flex-col gap-4">
        <div>
          <span className="text-sm font-medium text-ink-600">Fotoğraflar</span>
          <span className="block text-xs text-ink-400 mt-0.5">En fazla {AZAMI_ISLETME_FOTO}. İlki kapak olur.</span>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pt-3 pb-1">
            {korunan.map((f) => (
              <MevcutFoto key={f.id} profil={profil!} foto={f} onKaldir={() => setKorunan((l) => l.filter((x) => x.id !== f.id))} />
            ))}
            {yeniler.map((d, i) => (
              <YeniFoto key={i} dosya={d} onKaldir={() => setYeniler((l) => l.filter((_, j) => j !== i))} />
            ))}
            {fotoSayisi < AZAMI_ISLETME_FOTO && (
              <button
                type="button"
                onClick={() => dosyaGirdisi.current?.click()}
                className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-ink-200 text-ink-400 flex flex-col items-center justify-center gap-1 text-xs"
              >
                <Icon name="ImagePlus" className="w-5 h-5" />
                Ekle
              </button>
            )}
          </div>
          <input
            ref={dosyaGirdisi}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const secilen = [...(e.target.files ?? [])].filter((f) => f.type.startsWith('image/'))
              setYeniler((l) => [...l, ...secilen].slice(0, AZAMI_ISLETME_FOTO - korunan.length))
              e.target.value = ''
            }}
          />
        </div>

        <Alan etiket="Mekanın adı">
          <input className={GIRDI} value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} required />
        </Alan>
        <Alan etiket="Türü">
          <input className={GIRDI} value={kategori} onChange={(e) => setKategori(e.target.value)} maxLength={40} list="isletme-turleri" required />
          <datalist id="isletme-turleri">
            {TURLER.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Alan>
        <Alan etiket="Kısaca mekanın" ipucu="Neyi meşhur, ortamı nasıl? (300 karakter)">
          <textarea className={`${GIRDI} min-h-20`} value={aciklama} onChange={(e) => setAciklama(e.target.value)} maxLength={300} />
        </Alan>
        <Alan etiket="Adres">
          <input className={GIRDI} value={adres} onChange={(e) => setAdres(e.target.value)} maxLength={160} required />
        </Alan>
        <Alan etiket="Konum" ipucu="Mekandaysan Buradayım'a dokun ya da Google Haritalar'da pine sağ tıklayıp çıkan sayıları yapıştır.">
          <div className="flex gap-2">
            <input className={GIRDI} value={konumMetni} onChange={(e) => konumYazildi(e.target.value)} placeholder="40.987654, 29.025432" inputMode="decimal" />
            <button type="button" onClick={() => void buradayim()} disabled={konumAliniyor} className="btn-ghost border border-ink-100 shrink-0 text-sm flex items-center gap-1.5">
              <Icon name="LocateFixed" className="w-4 h-4" />
              {konumAliniyor ? '…' : 'Buradayım'}
            </button>
          </div>
        </Alan>
        <Alan etiket="Açık olduğu saatler">
          <input className={GIRDI} value={saatler} onChange={(e) => setSaatler(e.target.value)} maxLength={120} placeholder="Her gün 08:00–23:00" />
        </Alan>
        <Alan etiket="Telefon">
          <input className={GIRDI} value={telefon} onChange={(e) => setTelefon(e.target.value)} maxLength={30} inputMode="tel" placeholder="0216 000 00 00" />
        </Alan>
        <Alan etiket="Web sitesi">
          <input className={GIRDI} value={web} onChange={(e) => setWeb(e.target.value)} maxLength={200} inputMode="url" placeholder="ornekkafe.com" />
        </Alan>
        <Alan etiket="Instagram">
          <input className={GIRDI} value={instagram} onChange={(e) => setInstagram(e.target.value)} maxLength={60} placeholder="@ornekkafe" />
        </Alan>

        <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-sm font-semibold text-teal-800 flex items-center gap-2">
                <Icon name="Ticket" className="w-4 h-4" />
                Sharloop'la gelenlere indirim
              </span>
              <span className="block text-xs text-teal-700 mt-0.5">Müşteri kodu alır, kasada QR'ını okutursun.</span>
            </span>
            <input type="checkbox" checked={indirimAcik} onChange={(e) => setIndirimAcik(e.target.checked)} className="w-5 h-5 accent-teal-600" />
          </label>
          {indirimAcik && (
            <div className="flex flex-col gap-3 mt-3">
              <input className={GIRDI} value={indirimMetni} onChange={(e) => setIndirimMetni(e.target.value)} maxLength={80} placeholder="Tüm içeceklerde %15 indirim" />
              <input className={GIRDI} value={indirimKosulu} onChange={(e) => setIndirimKosulu(e.target.value)} maxLength={120} placeholder="Koşul (isteğe bağlı): Kişi başı günde bir kez" />
            </div>
          )}
        </div>

        {hata && <p className="text-sm text-rose-600">{hata}</p>}
        {kaydedildi && !hata && (
          <p className="text-sm text-teal-700 flex items-center gap-1.5">
            <Icon name="Check" className="w-4 h-4" />
            Kaydedildi. Yakındaki Sharloop kullanıcıları artık bunu görüyor.
          </p>
        )}
        <button type="submit" disabled={kaydediliyor} className="btn-primary w-full disabled:opacity-60">
          {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>

      {profil && (
        <>
          <section className="card p-5 mt-6">
            <h3 className="font-semibold text-ink-700 flex items-center gap-2 mb-1">
              <Icon name="QrCode" className="w-4 h-4 text-bolum-koyu" />
              Kasada indirim onaylama
            </h3>
            <p className="text-sm text-ink-400 mb-3">
              Müşterinin gösterdiği QR'ı kasadaki telefonun kamerasıyla okut; açılan sayfa kodun bugün geçerli olup olmadığını söyler.
              Kodu elle yazmak için bu sayfayı kasadaki telefonda açık tut:
            </p>
            <div
              className="w-36 h-36 mx-auto mb-3 [&>svg]:w-full [&>svg]:h-full"
              role="img"
              aria-label="Kod doğrulama sayfasının QR kodu"
              dangerouslySetInnerHTML={{ __html: qrSvg(dogrulama) }}
            />
            <a href={dogrulama} target="_blank" rel="noopener" className="btn-ghost border border-ink-100 w-full flex items-center justify-center gap-2 text-sm">
              <Icon name="ExternalLink" className="w-4 h-4" />
              Doğrulama sayfasını aç
            </a>
          </section>

          <section className="card p-5 mt-4">
            <h3 className="font-semibold text-ink-700 mb-1">Akış'ta öne çık</h3>
            <p className="text-sm text-ink-400">
              Mekanını yakındaki kişilerin Akış'ında "Sponsorlu" olarak öne çıkarmak için{' '}
              <a href={`mailto:${DESTEK}?subject=${encodeURIComponent(`Sponsorlu mekan: ${profil.ad}`)}&body=${encodeURIComponent(`İşletme kimliği: ${benimId}`)}`} className="text-bolum-koyu font-medium underline">
                {DESTEK}
              </a>{' '}
              adresine yaz. E-postada işletme kimliğin hazır gelir.
            </p>
          </section>

          <button onClick={() => setKapatOnay(true)} className="w-full py-3 mt-4 text-xs font-medium text-ink-400 hover:text-rose-600">
            İşletme profilini kapat
          </button>
        </>
      )}

      {kapatOnay && (
        <ConfirmDialog
          title="İşletme profili kapatılsın mı?"
          message="Fotoğrafların, iletişim bilgilerin ve indirimin Sharloop'tan kalkar. Daha önce verilen kodlar o gün geçerli kalır."
          confirmLabel="Profili kapat"
          onConfirm={() => void profiliKapat()}
          onCancel={() => setKapatOnay(false)}
        />
      )}
    </div>
  )
}
