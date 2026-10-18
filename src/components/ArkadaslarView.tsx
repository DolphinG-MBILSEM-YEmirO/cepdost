import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Avatar } from './Avatar'
import { ArkadasMusaitlik } from './ArkadasMusaitlik'
import { GirisEkrani } from './GirisEkrani'
import { useAuth } from '../sosyal/auth'
import { avatarOnbelleginiBosalt, avatarSil, avatarYukle } from '../sosyal/avatar'
import { musaitligiSenkronla } from '../sosyal/musaitlikSenkron'
import {
  arkadaslariGetir,
  arkadaslikIsteGonder,
  arkadaslikYanitla,
  arkadasliktanCik,
  davetleriGetir,
  davetYanitla,
  profilAra,
  profilGuncelle,
  profilimiGetir,
  type Arkadas,
  type AramaSonucu,
  type PlanDaveti,
  type Profil,
} from '../sosyal/api'
import { GrupDetay } from './GrupDetay'
import { OrtakPlanSihirbazi } from './OrtakPlanSihirbazi'
import { HesapKurulumu } from './HesapKurulumu'
import { grupOlustur, gruplarimiGetir, type Grup } from '../sosyal/gruplar'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, kayitOlustur, type Kayit } from '../db'
import { formatDate, formatTime } from '../lib/format'

interface Props {
  kayitlar: Kayit[]
  // Davet linkiyle (?ekle=KOD) gelindiyse arama kutusuna hazır yazılır.
  baslangicKodu?: string | null
  onDegisti?: () => void
}

export function ArkadaslarView({ kayitlar, baslangicKodu, onDegisti }: Props) {
  const { kullanici, yukleniyor: authYukleniyor, cikis } = useAuth()

  if (authYukleniyor) {
    return (
      <div className="flex items-center justify-center h-full">
        <Icon name="Loader2" className="w-6 h-6 animate-spin text-ink-300" />
      </div>
    )
  }

  if (!kullanici) return <GirisEkrani />

  return (
    <ArkadaslarIcerik
      kullaniciId={kullanici.id}
      kayitlar={kayitlar}
      onCikis={cikis}
      baslangicKodu={baslangicKodu}
      onDegisti={onDegisti}
    />
  )
}

function ArkadaslarIcerik({
  kullaniciId,
  kayitlar,
  onCikis,
  baslangicKodu,
  onDegisti,
}: {
  kullaniciId: string
  kayitlar: Kayit[]
  onCikis: () => Promise<void>
  baslangicKodu?: string | null
  onDegisti?: () => void
}) {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [arkadaslar, setArkadaslar] = useState<Arkadas[]>([])
  const [gelenDavetler, setGelenDavetler] = useState<PlanDaveti[]>([])
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [secili, setSecili] = useState<Profil | null>(null)
  const [seciliGrup, setSeciliGrup] = useState<Grup | null>(null)
  const [grupKurAcik, setGrupKurAcik] = useState(false)
  const [sihirbazAcik, setSihirbazAcik] = useState(false)

  const tazele = useCallback(async () => {
    setHata(null)
    try {
      const [p, a, d, g] = await Promise.all([
        profilimiGetir(),
        arkadaslariGetir(),
        davetleriGetir(),
        gruplarimiGetir(),
      ])
      setProfil(p)
      setArkadaslar(a)
      setGelenDavetler(d.gelen.filter((x) => x.durum === 'bekliyor'))
      setGruplar(g)
      onDegisti?.()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Veriler alınamadı')
    } finally {
      setYukleniyor(false)
    }
  }, [onDegisti])

  useEffect(() => {
    void tazele()
  }, [tazele])

  // Yerel planlar değiştikçe müsaitliği sunucuya yansıt. Sessizce çalışır —
  // senkron hatası kullanıcıyı bloklamamalı, arkadaşlık ekranı yine açılır.
  // Takvimden içe aktarılanlar da müsaitliğe giriyor (bkz. bloklariCikar),
  // o yüzden sayıları değişince yeniden senkronlanmalı.
  const takvimSayisi = useLiveQuery(() => db.takvimEtkinlikleri.count(), [], 0)

  useEffect(() => {
    if (!profil) return
    musaitligiSenkronla(kullaniciId, profil.musaitlik_paylas).catch((err) => {
      console.warn('müsaitlik senkronu başarısız', err)
    })
  }, [kullaniciId, profil, kayitlar, takvimSayisi])

  async function davetiKabulEt(davet: PlanDaveti) {
    // Önce yerel kayıt: sunucu güncellemesi başarısız olsa bile kullanıcı
    // kabul ettiği planı kaybetmesin.
    await kayitOlustur({
      kategori: 'etkinlik',
      baslik: davet.baslik,
      tarih: davet.tarih,
      saat: davet.saat ? davet.saat.slice(0, 5) : null,
      konum: davet.konum,
      oncelik: 'orta',
      sure: davet.sure,
      ozetNot: davet.mesaj,
      mekanOnerisi: null,
      yakinOneriler: null,
      kaynakTipi: 'metin',
      hamBaslik: '',
      hamMetin: '',
      hamLink: '',
      gorseller: [],
      // Tarihi geçince anıyı doğru arşive (davet edenin) yönlendirmek için.
      arkadasId: davet.gonderen_id,
      arkadasAdi: arkadaslar.find((a) => a.profil.id === davet.gonderen_id)?.profil.ad ?? null,
    })
    await davetYanitla(davet.id, true)
    await tazele()
  }

  async function davetiReddet(davet: PlanDaveti) {
    await davetYanitla(davet.id, false)
    await tazele()
  }

  const kabulEdilmis = arkadaslar.filter((a) => a.durum === 'kabul')
  const gelenIstekler = arkadaslar.filter((a) => a.durum === 'bekliyor' && a.yon === 'gelen')
  const gidenIstekler = arkadaslar.filter((a) => a.durum === 'bekliyor' && a.yon === 'giden')

  // Kullanıcı adı yoksa kurulum tamamlanmamış demektir — sosyal katmana
  // geçmeden önce isim/kullanıcı adı/gizlilik belirlenmeli.
  if (!yukleniyor && profil && !profil.kullanici_adi) {
    return <HesapKurulumu profil={profil} onTamamlandi={tazele} />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-700">Arkadaşlar</h1>
          <p className="text-sm text-ink-400 mt-0.5">
            {kabulEdilmis.length > 0 ? `${kabulEdilmis.length} arkadaş` : 'Birlikte plan yap'}
          </p>
        </div>
        <button
          onClick={() => void onCikis()}
          className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Çıkış yap"
        >
          <Icon name="LogOut" className="w-5 h-5 text-ink-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-24 space-y-6">
        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        {yukleniyor ? (
          <div className="space-y-3 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-3xl" />
            ))}
          </div>
        ) : (
          <>
            {profil && <KimlikKarti profil={profil} onDegisti={tazele} />}

            {kabulEdilmis.length > 0 && (
              <button
                onClick={() => setSihirbazAcik(true)}
                className="w-full card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-10 h-10 rounded-2xl bg-coral-100 flex items-center justify-center shrink-0">
                  <Icon name="Wand2" className="w-5 h-5 text-coral-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-700">Herkese uyan saati bul</p>
                  <p className="text-xs text-ink-400">
                    Arkadaşlarını seç, gerisini yapay zekâ halletsin
                  </p>
                </div>
                <Icon name="ChevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
              </button>
            )}

            <ArkadasEkle onEklendi={tazele} baslangicKodu={baslangicKodu} />

            {gelenDavetler.length > 0 && (
              <Bolum baslik="Plan davetleri" ikon="CalendarClock" sayi={gelenDavetler.length}>
                <div className="space-y-3">
                  {gelenDavetler.map((d) => (
                    <DavetKarti
                      key={d.id}
                      davet={d}
                      gonderenAd={
                        arkadaslar.find((a) => a.profil.id === d.gonderen_id)?.profil.ad ?? 'Bir arkadaşın'
                      }
                      onKabul={() => void davetiKabulEt(d)}
                      onRed={() => void davetiReddet(d)}
                    />
                  ))}
                </div>
              </Bolum>
            )}

            {gelenIstekler.length > 0 && (
              <Bolum baslik="Arkadaşlık istekleri" ikon="UserPlus" sayi={gelenIstekler.length}>
                <div className="space-y-3">
                  {gelenIstekler.map((a) => (
                    <IstekKarti key={a.arkadaslikId} arkadas={a} onYanit={tazele} />
                  ))}
                </div>
              </Bolum>
            )}

            <Bolum baslik="Gruplar" ikon="Users" sayi={gruplar.length}>
              <div className="space-y-3">
                {gruplar.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSeciliGrup(g)}
                    className="card p-4 w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="w-9 h-9 rounded-2xl bg-sky-100 flex items-center justify-center shrink-0">
                      <Icon name="Users" className="w-4.5 h-4.5 text-sky-600" />
                    </div>
                    <p className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate">{g.ad}</p>
                    <Icon name="ChevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
                  </button>
                ))}
                <button
                  onClick={() => setGrupKurAcik(true)}
                  disabled={kabulEdilmis.length === 0}
                  className="w-full btn-ghost border border-ink-100/40 text-sm py-3 flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <Icon name="Plus" className="w-4 h-4" />
                  {kabulEdilmis.length === 0 ? 'Grup için önce arkadaş ekle' : 'Grup kur'}
                </button>
              </div>
            </Bolum>

            <Bolum baslik="Arkadaşların" ikon="Users" sayi={kabulEdilmis.length}>
              {kabulEdilmis.length === 0 ? (
                <div className="card p-5 text-center">
                  <p className="text-sm text-ink-400">
                    Henüz arkadaşın yok. Yukarıdaki kodunu paylaş ya da bir arkadaşının kodunu gir.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {kabulEdilmis.map((a) => (
                    <ArkadasKarti
                      key={a.arkadaslikId}
                      arkadas={a}
                      onAc={() => setSecili(a.profil)}
                      onCikar={tazele}
                    />
                  ))}
                </div>
              )}
            </Bolum>

            {gidenIstekler.length > 0 && (
              <Bolum baslik="Bekleyen isteklerin" ikon="Clock" sayi={gidenIstekler.length} soluk>
                <div className="space-y-3">
                  {gidenIstekler.map((a) => (
                    <div key={a.arkadaslikId} className="card p-4 flex items-center gap-3">
                      <Avatar ad={a.profil.ad} avatarYol={a.profil.avatar_yol} boyut="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-600 truncate">{a.profil.ad}</p>
                        <p className="text-xs text-ink-300">Onay bekleniyor</p>
                      </div>
                      <button
                        onClick={async () => {
                          await arkadasliktanCik(a.arkadaslikId)
                          await tazele()
                        }}
                        className="text-xs font-medium text-ink-400 active:scale-95 transition-transform"
                      >
                        İptal
                      </button>
                    </div>
                  ))}
                </div>
              </Bolum>
            )}
          </>
        )}
      </div>

      {secili && (
        <ArkadasMusaitlik arkadas={secili} benimId={kullaniciId} onClose={() => setSecili(null)} />
      )}

      {seciliGrup && (
        <GrupDetay
          grup={seciliGrup}
          benimId={kullaniciId}
          arkadaslar={arkadaslar}
          onClose={() => setSeciliGrup(null)}
          onAyrildi={async () => {
            setSeciliGrup(null)
            await tazele()
          }}
        />
      )}

      {grupKurAcik && (
        <GrupKurModal
          arkadaslar={kabulEdilmis}
          onClose={() => setGrupKurAcik(false)}
          onKuruldu={async () => {
            setGrupKurAcik(false)
            await tazele()
          }}
        />
      )}

      {sihirbazAcik && (
        <OrtakPlanSihirbazi
          benimAdim={profil?.ad ?? 'Ben'}
          arkadaslar={kabulEdilmis}
          onKapat={() => setSihirbazAcik(false)}
          onOlusturuldu={tazele}
        />
      )}
    </div>
  )
}

function GrupKurModal({
  arkadaslar,
  onClose,
  onKuruldu,
}: {
  arkadaslar: Arkadas[]
  onClose: () => void
  onKuruldu: () => Promise<void>
}) {
  const [ad, setAd] = useState('')
  const [secilenler, setSecilenler] = useState<Set<string>>(new Set())
  const [kuruluyor, setKuruluyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  function degistir(id: string) {
    setSecilenler((eski) => {
      const yeni = new Set(eski)
      if (yeni.has(id)) yeni.delete(id)
      else yeni.add(id)
      return yeni
    })
  }

  async function kur() {
    if (!ad.trim()) {
      setHata('Gruba bir isim ver.')
      return
    }
    setKuruluyor(true)
    setHata(null)
    try {
      await grupOlustur(ad.trim(), Array.from(secilenler))
      await onKuruldu()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Grup kurulamadı')
    } finally {
      setKuruluyor(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-sm mx-4 mb-4 sm:mb-0 p-5 animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-ink-700 mb-4">Grup kur</h3>

        <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Grup adı
        </label>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          placeholder="Kadıköy Ekibi"
          className="input-field mb-4"
          autoFocus
        />

        <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">
          Kimler olsun
        </label>
        <div className="space-y-2 mb-4">
          {arkadaslar.map((a) => {
            const secili = secilenler.has(a.profil.id)
            return (
              <button
                key={a.profil.id}
                onClick={() => degistir(a.profil.id)}
                className={`w-full flex items-center gap-3 rounded-2xl p-3 border transition-all active:scale-[0.98] ${
                  secili ? 'bg-coral-50 border-coral-200' : 'bg-cream-100 border-ink-100/40'
                }`}
              >
                <Avatar ad={a.profil.ad} avatarYol={a.profil.avatar_yol} boyut="sm" />
                <span className="flex-1 min-w-0 text-sm font-medium text-ink-700 truncate text-left">
                  {a.profil.ad}
                </span>
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                    secili ? 'bg-coral-500' : 'bg-cream-50 border border-ink-200'
                  }`}
                >
                  {secili && <Icon name="Check" className="w-3.5 h-3.5 text-white" />}
                </div>
              </button>
            )
          })}
        </div>

        {hata && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-3 mb-4">
            <Icon name="AlertCircle" className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-700">{hata}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={kuruluyor} className="btn-ghost flex-1 border border-ink-100/40">
            Vazgeç
          </button>
          <button onClick={() => void kur()} disabled={kuruluyor} className="btn-primary flex-1 disabled:opacity-50">
            {kuruluyor ? '...' : 'Kur'}
          </button>
        </div>
      </div>
    </div>
  )
}

function KimlikKarti({ profil, onDegisti }: { profil: Profil; onDegisti: () => Promise<void> }) {
  const [kopyalandi, setKopyalandi] = useState(false)
  const [duzenle, setDuzenle] = useState(false)
  const [kullaniciAdi, setKullaniciAdi] = useState(profil.kullanici_adi ?? '')
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const kodGosterim = `${profil.arkadas_kodu.slice(0, 4)}-${profil.arkadas_kodu.slice(4)}`
  const davetLinki = `${window.location.origin}/?ekle=${profil.arkadas_kodu}`

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(kodGosterim)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch {
      setHata('Kopyalanamadı — kodu elle seçebilirsin.')
    }
  }

  async function paylas() {
    const metin = `CepDost'ta arkadaşım ol! Kodum: ${kodGosterim}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'CepDost', text: metin, url: davetLinki })
        return
      } catch {
        // Kullanıcı paylaşımı iptal etti — sessizce geç.
        return
      }
    }
    try {
      await navigator.clipboard.writeText(`${metin}\n${davetLinki}`)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 2000)
    } catch {
      setHata('Paylaşılamadı.')
    }
  }

  async function kullaniciAdiKaydet() {
    setKaydediliyor(true)
    setHata(null)
    try {
      const temiz = kullaniciAdi.trim().toLocaleLowerCase('tr-TR').replace(/^@/, '')
      await profilGuncelle({ kullanici_adi: temiz || null })
      setDuzenle(false)
      await onDegisti()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setKaydediliyor(false)
    }
  }

  async function paylasimDegistir() {
    setHata(null)
    try {
      await profilGuncelle({ musaitlik_paylas: !profil.musaitlik_paylas })
      await onDegisti()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Güncellenemedi')
    }
  }

  async function gizlilikDegistir() {
    setHata(null)
    try {
      await profilGuncelle({
        gizlilik: profil.gizlilik === 'herkes' ? 'arkadaslar' : 'herkes',
      })
      await onDegisti()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Güncellenemedi')
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <AvatarSecici profil={profil} onDegisti={onDegisti} onHata={setHata} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink-700 truncate">{profil.ad}</p>
          {duzenle ? null : (
            <button
              onClick={() => setDuzenle(true)}
              className="text-xs text-coral-600 font-medium active:scale-95 transition-transform"
            >
              {profil.kullanici_adi ? `@${profil.kullanici_adi}` : 'Kullanıcı adı belirle'}
            </button>
          )}
        </div>
      </div>

      {duzenle && (
        <div className="mb-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-cream-100 border border-ink-100/40 rounded-xl px-3">
              <span className="text-ink-300 text-sm">@</span>
              <input
                value={kullaniciAdi}
                onChange={(e) => setKullaniciAdi(e.target.value)}
                placeholder="kullaniciadi"
                autoFocus
                className="flex-1 bg-transparent py-2.5 px-1 text-ink-700 font-medium placeholder:text-ink-300 focus:outline-none text-sm"
              />
            </div>
            <button
              onClick={() => void kullaniciAdiKaydet()}
              disabled={kaydediliyor}
              className="btn-primary text-sm px-4 py-2.5 disabled:opacity-50"
            >
              {kaydediliyor ? '...' : 'Kaydet'}
            </button>
          </div>
          <button
            onClick={() => {
              setDuzenle(false)
              setKullaniciAdi(profil.kullanici_adi ?? '')
              setHata(null)
            }}
            className="text-xs text-ink-400 mt-2"
          >
            Vazgeç
          </button>
        </div>
      )}

      <div className="bg-cream-100 rounded-2xl p-4 mb-3">
        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Arkadaş kodun</p>
        <div className="flex items-center gap-2">
          <span className="font-display text-xl font-bold text-ink-700 tracking-wider flex-1">
            {kodGosterim}
          </span>
          <button
            onClick={() => void kopyala()}
            className="w-9 h-9 rounded-xl bg-cream-50 border border-ink-100/40 flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Kodu kopyala"
          >
            <Icon
              name={kopyalandi ? 'Check' : 'Copy'}
              className={`w-4 h-4 ${kopyalandi ? 'text-teal-600' : 'text-ink-400'}`}
            />
          </button>
          <button
            onClick={() => void paylas()}
            className="w-9 h-9 rounded-xl bg-coral-500 flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Paylaş"
          >
            <Icon name="Share2" className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Anahtar
          acik={profil.musaitlik_paylas}
          onDegistir={() => void paylasimDegistir()}
          baslik="Müsaitliğimi arkadaşlarım görsün"
          aciklama={
            profil.musaitlik_paylas
              ? 'Sadece dolu saat aralıkların görünüyor'
              : 'Kapalı — sunucudaki saat bilgilerin de silindi'
          }
        />
        <Anahtar
          acik={profil.gizlilik === 'herkes'}
          onDegistir={() => void gizlilikDegistir()}
          baslik="Hesabım herkese açık"
          aciklama={
            profil.gizlilik === 'herkes'
              ? 'Profilini tüm CepDost kullanıcıları görebilir'
              : 'Profilini yalnızca arkadaşların görebilir'
          }
        />
      </div>

      {hata && <p className="text-xs text-rose-600 mt-3">{hata}</p>}
    </div>
  )
}

// Profil fotoğrafı: dosya seçici + kaldırma. Yeniden boyutlandırma ve
// yükleme sosyal/avatar.ts'te; burada sadece etkileşim var.
function AvatarSecici({
  profil,
  onDegisti,
  onHata,
}: {
  profil: Profil
  onDegisti: () => Promise<void>
  onHata: (m: string | null) => void
}) {
  const [calisiyor, setCalisiyor] = useState(false)
  const girdiRef = useRef<HTMLInputElement>(null)

  async function secildi(dosya: File | undefined) {
    if (!dosya) return
    setCalisiyor(true)
    onHata(null)
    try {
      await avatarYukle(dosya)
      avatarOnbelleginiBosalt()
      await onDegisti()
    } catch (err) {
      onHata(err instanceof Error ? err.message : 'Fotoğraf yüklenemedi')
    } finally {
      setCalisiyor(false)
      // Aynı dosya tekrar seçilebilsin diye girdiyi sıfırla.
      if (girdiRef.current) girdiRef.current.value = ''
    }
  }

  async function kaldir() {
    setCalisiyor(true)
    onHata(null)
    try {
      await avatarSil()
      avatarOnbelleginiBosalt()
      await onDegisti()
    } catch (err) {
      onHata(err instanceof Error ? err.message : 'Fotoğraf kaldırılamadı')
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => girdiRef.current?.click()}
        disabled={calisiyor}
        aria-label="Profil fotoğrafını değiştir"
        className="block active:scale-95 transition-transform disabled:opacity-60"
      >
        <Avatar ad={profil.ad} avatarYol={profil.avatar_yol} />
        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-coral-500 text-white flex items-center justify-center shadow-soft ring-2 ring-cream-50">
          <Icon name={calisiyor ? 'Loader2' : 'Camera'} className={`w-3.5 h-3.5 ${calisiyor ? 'animate-spin' : ''}`} />
        </span>
      </button>

      {profil.avatar_yol && !calisiyor && (
        <button
          onClick={() => void kaldir()}
          aria-label="Profil fotoğrafını kaldır"
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ink-500/80 text-white flex items-center justify-center"
        >
          <Icon name="X" className="w-3 h-3" />
        </button>
      )}

      <input
        ref={girdiRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void secildi(e.target.files?.[0])}
      />
    </div>
  )
}

function Anahtar({
  acik,
  onDegistir,
  baslik,
  aciklama,
}: {
  acik: boolean
  onDegistir: () => void
  baslik: string
  aciklama: string
}) {
  return (
    <button
      onClick={onDegistir}
      className="w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
    >
      <div
        className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${
          acik ? 'bg-teal-500' : 'bg-ink-200'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-all ${
            acik ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-600">{baslik}</p>
        <p className="text-xs text-ink-400">{aciklama}</p>
      </div>
    </button>
  )
}

function ArkadasEkle({
  onEklendi,
  baslangicKodu,
}: {
  onEklendi: () => Promise<void>
  baslangicKodu?: string | null
}) {
  const [girdi, setGirdi] = useState(baslangicKodu ?? '')
  const [araniyor, setAraniyor] = useState(false)
  const [sonuc, setSonuc] = useState<AramaSonucu | null>(null)
  const [bulunamadi, setBulunamadi] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [ekleniyor, setEkleniyor] = useState(false)

  async function ara(e: React.FormEvent) {
    e.preventDefault()
    const q = girdi.trim()
    if (!q) return
    setAraniyor(true)
    setHata(null)
    setSonuc(null)
    setBulunamadi(false)
    try {
      const p = await profilAra(q)
      if (p) setSonuc(p)
      else setBulunamadi(true)
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Arama başarısız')
    } finally {
      setAraniyor(false)
    }
  }

  async function ekle() {
    if (!sonuc) return
    setEkleniyor(true)
    setHata(null)
    try {
      await arkadaslikIsteGonder(sonuc.id)
      setSonuc(null)
      setGirdi('')
      await onEklendi()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'İstek gönderilemedi')
    } finally {
      setEkleniyor(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="UserPlus" className="w-4 h-4 text-coral-500" />
        <h2 className="text-sm font-semibold text-ink-600">Arkadaş ekle</h2>
      </div>

      <form onSubmit={ara} className="flex gap-2">
        <input
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          placeholder="Kod (A1B2-C3D4) veya @kullaniciadi"
          className="input-field flex-1"
        />
        <button
          type="submit"
          disabled={araniyor || !girdi.trim()}
          className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50 shrink-0"
        >
          {araniyor ? <Icon name="Loader2" className="w-4 h-4 animate-spin" /> : 'Ara'}
        </button>
      </form>

      {bulunamadi && (
        <p className="text-sm text-ink-400 mt-3">
          Bu kod veya kullanıcı adıyla kimse bulunamadı. Yazımı kontrol eder misin?
        </p>
      )}

      {sonuc && (
        <div className="mt-3 flex items-center gap-3 bg-cream-100 rounded-2xl p-3">
          <Avatar ad={sonuc.ad} avatarYol={sonuc.avatar_yol} boyut="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-700 truncate">{sonuc.ad}</p>
            {sonuc.kullanici_adi && <p className="text-xs text-ink-400">@{sonuc.kullanici_adi}</p>}
          </div>
          <button
            onClick={() => void ekle()}
            disabled={ekleniyor}
            className="btn-primary text-sm px-3.5 py-2 disabled:opacity-50 shrink-0"
          >
            {ekleniyor ? '...' : 'İstek gönder'}
          </button>
        </div>
      )}

      {hata && <p className="text-xs text-rose-600 mt-3">{hata}</p>}
    </div>
  )
}

function IstekKarti({ arkadas, onYanit }: { arkadas: Arkadas; onYanit: () => Promise<void> }) {
  const [isleniyor, setIsleniyor] = useState(false)

  async function yanitla(kabul: boolean) {
    setIsleniyor(true)
    try {
      await arkadaslikYanitla(arkadas.arkadaslikId, kabul)
      await onYanit()
    } finally {
      setIsleniyor(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <Avatar ad={arkadas.profil.ad} avatarYol={arkadas.profil.avatar_yol} boyut="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-700 truncate">{arkadas.profil.ad}</p>
          <p className="text-xs text-ink-400">Seni arkadaş olarak eklemek istiyor</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void yanitla(false)}
          disabled={isleniyor}
          className="btn-ghost flex-1 border border-ink-100/40 text-sm py-2.5 disabled:opacity-50"
        >
          Reddet
        </button>
        <button
          onClick={() => void yanitla(true)}
          disabled={isleniyor}
          className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50"
        >
          Kabul et
        </button>
      </div>
    </div>
  )
}

function ArkadasKarti({
  arkadas,
  onAc,
  onCikar,
}: {
  arkadas: Arkadas
  onAc: () => void
  onCikar: () => Promise<void>
}) {
  const [onay, setOnay] = useState(false)

  return (
    <div className="card p-4 flex items-center gap-3">
      <button onClick={onAc} className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-[0.98] transition-transform">
        <Avatar ad={arkadas.profil.ad} avatarYol={arkadas.profil.avatar_yol} boyut="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-700 truncate">{arkadas.profil.ad}</p>
          <p className="text-xs text-ink-400 truncate">
            {arkadas.profil.musaitlik_paylas ? 'Müsaitliğine bak' : 'Müsaitlik paylaşmıyor'}
          </p>
        </div>
        <Icon name="ChevronRight" className="w-4 h-4 text-ink-300 shrink-0" />
      </button>
      {onay ? (
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setOnay(false)}
            className="text-xs font-medium text-ink-400 px-2 py-1"
          >
            Vazgeç
          </button>
          <button
            onClick={async () => {
              await arkadasliktanCik(arkadas.arkadaslikId)
              await onCikar()
            }}
            className="text-xs font-semibold text-rose-600 px-2 py-1"
          >
            Çıkar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOnay(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform shrink-0"
          aria-label="Arkadaşlıktan çıkar"
        >
          <Icon name="Trash2" className="w-4 h-4 text-ink-300" />
        </button>
      )}
    </div>
  )
}

function DavetKarti({
  davet,
  gonderenAd,
  onKabul,
  onRed,
}: {
  davet: PlanDaveti
  gonderenAd: string
  onKabul: () => void
  onRed: () => void
}) {
  const [isleniyor, setIsleniyor] = useState(false)
  const detay = [formatDate(davet.tarih), davet.saat ? formatTime(davet.saat.slice(0, 5)) : null, davet.konum]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="card p-4 border-coral-100 bg-coral-50/40">
      <div className="flex items-center gap-2.5 mb-2">
        <Avatar ad={gonderenAd} boyut="sm" />
        <div className="min-w-0">
          <p className="text-xs text-ink-400">{gonderenAd} davet etti</p>
          <p className="text-sm font-semibold text-ink-700 truncate">{davet.baslik}</p>
        </div>
      </div>
      <p className="text-xs text-ink-500 mb-1">{detay}</p>
      {davet.mesaj && <p className="text-xs text-ink-400 italic mb-3">“{davet.mesaj}”</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            setIsleniyor(true)
            onRed()
          }}
          disabled={isleniyor}
          className="btn-ghost flex-1 border border-ink-100/40 text-sm py-2.5 disabled:opacity-50"
        >
          Uygun değilim
        </button>
        <button
          onClick={() => {
            setIsleniyor(true)
            onKabul()
          }}
          disabled={isleniyor}
          className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50"
        >
          Kabul et
        </button>
      </div>
    </div>
  )
}

function Bolum({
  baslik,
  ikon,
  sayi,
  soluk,
  children,
}: {
  baslik: string
  ikon: 'Users' | 'UserPlus' | 'CalendarClock' | 'Clock'
  sayi: number
  soluk?: boolean
  children: React.ReactNode
}) {
  const renk = soluk ? 'text-ink-300' : 'text-ink-400'
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon name={ikon} className={`w-4 h-4 ${renk}`} />
        <h2 className={`text-sm font-semibold ${soluk ? 'text-ink-300' : 'text-ink-500'}`}>{baslik}</h2>
        <span className={`text-xs ${renk}`}>{sayi}</span>
      </div>
      {children}
    </div>
  )
}
