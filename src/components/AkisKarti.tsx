import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { SikayetSayfasi } from './SikayetSayfasi'
import { Avatar } from './Avatar'
import { AniMedyaGalerisi } from './AniMedyaGalerisi'
import { ConfirmDialog } from './ConfirmDialog'
import { PaylasimMenusu, type MenuSecenegi } from './PaylasimMenusu'
import { EtiketSecici } from './EtiketSecici'
import { useEtiketAdaylari, type EtiketKitlesi } from './useEtiketAdaylari'
import { useKayitliListeler } from './useKayitliListeler'
import { AZAMI_PUAN, aniGuncelle, aniSil, type Ani } from '../sosyal/gruplar'
import type { Profil } from '../sosyal/api'
import { BOS_ETKILESIM, aniyiBegen, etiketimiKaldir, gorunenEtiketler, type AniEtkilesimi } from '../sosyal/aniEtkilesimi'
import { adListesi } from '../sosyal/adlar'
import { formatDate } from '../lib/format'
import { UYGULAMA_ADI } from '../../shared/marka'
import { Katman } from '../ui/Katman'

// A memory as a card: who shared it (and in which group), the photos and
// clips, the place, the rating, the day, the note and who's tagged. Its
// answers go in as children. A double tap on the photos leaves a heart.
// The "⋯" menu holds the rest: saving the post, and for the sharer
// tagging people, turning comments off, archiving and deleting.

// Two taps closer than this are a double tap.
const CIFT_DOKUNUS_MS = 300

// What happened to a post from its menu, for the screen to follow.
export type PaylasimOlayi =
  | { tur: 'silindi'; ani: Ani }
  | { tur: 'arsivlendi'; ani: Ani }
  | { tur: 'arsivdenCikti'; ani: Ani }
  | { tur: 'guncellendi'; ani: Ani }

// Who can be tagged in a post that's already out.
function etiketKitlesi(ani: Ani): EtiketKitlesi {
  if (ani.grup_id) return { grupId: ani.grup_id }
  if (ani.arkadas_id) return { arkadasId: ani.arkadas_id }
  return 'arkadaslarim'
}

export function AkisKarti({
  ani,
  sahip,
  grupAdi,
  yeni = false,
  benimId,
  onEngellendi,
  profiller,
  etkilesim = BOS_ETKILESIM,
  yanitlanabilir = false,
  sahipIslemleri = false,
  onDegisti,
  children,
}: {
  ani: Ani
  sahip: Profil | null
  // The group it was shared in, when it was.
  grupAdi?: string | null
  // Shared since I last looked at the feed.
  yeni?: boolean
  // With it, someone else's memory gets a "Report" button.
  benimId?: string
  // The owner was blocked from the report sheet.
  onEngellendi?: (kisiId: string) => void
  // Names for the tagged people.
  profiller?: Map<string, Profil>
  etkilesim?: AniEtkilesimi
  // Friends can answer it here: a double tap likes it, and a tagged person
  // can take their tag off.
  yanitlanabilir?: boolean
  // The sharer can change it from here (not from a Keşfet copy).
  sahipIslemleri?: boolean
  onDegisti?: (olay: PaylasimOlayi) => void
  children?: React.ReactNode
}) {
  const [sikayetAcik, setSikayetAcik] = useState(false)
  const [menuAcik, setMenuAcik] = useState(false)
  const [etiketAcik, setEtiketAcik] = useState(false)
  const [silinsinMi, setSilinsinMi] = useState(false)
  const [mesgul, setMesgul] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  // A new key on every double tap restarts the heart's animation.
  const [kalp, setKalp] = useState(0)
  const sonDokunus = useRef(0)
  const { kayitli, koy } = useKayitliListeler(ani)

  const benim = !!benimId && ani.sahip_id === benimId
  const sikayetEdilebilir = !!benimId && !benim
  const duzenlenebilir = benim && sahipIslemleri
  const etiketliler = gorunenEtiketler(ani, etkilesim)
  const etiketliyim = !!benimId && etiketliler.includes(benimId)
  // Fotoğrafını herkese açmış ama profili kapalı biri olabilir — o zaman
  // profili okuyamayız, isim yerine nötr bir etiket gösteriyoruz.
  const ad = sahip?.ad ?? `${UYGULAMA_ADI} kullanıcısı`

  async function calistir(is: () => Promise<unknown>) {
    setMesgul(true)
    setHata(null)
    try {
      await is()
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Olmadı, tekrar dener misin?')
    } finally {
      setMesgul(false)
    }
  }

  function dokunuldu(e: React.MouseEvent) {
    if (!yanitlanabilir) return
    // The gallery's dots are buttons of their own.
    if (e.target instanceof Element && e.target.closest('button')) return
    if (e.timeStamp - sonDokunus.current > CIFT_DOKUNUS_MS) {
      sonDokunus.current = e.timeStamp
      return
    }
    sonDokunus.current = 0
    setKalp((k) => k + 1)
    void aniyiBegen(ani).catch((err) => setHata(err instanceof Error ? err.message : 'Beğenilemedi.'))
  }

  const secenekler: MenuSecenegi[] = []
  if (!benim) {
    secenekler.push({
      anahtar: 'kaydet',
      ikon: kayitli ? 'BookmarkCheck' : 'Bookmark',
      etiket: kayitli ? 'Kaydedilenlerden çıkar' : 'Kaydet',
      aciklama: kayitli ? undefined : 'Profil → Kaydedilen’de durur, yalnızca sen görürsün',
      onSec: () => void calistir(() => koy('kaydedilen', !kayitli)),
    })
  }
  if (duzenlenebilir) {
    secenekler.push(
      {
        anahtar: 'etiket',
        ikon: 'Tag',
        etiket: ani.etiketler.length > 0 ? 'Etiketleri düzenle' : 'Kişileri etiketle',
        onSec: () => setEtiketAcik(true),
      },
      {
        anahtar: 'yorum',
        ikon: ani.yorumlar_kapali ? 'MessageCircle' : 'MessageCircleOff',
        etiket: ani.yorumlar_kapali ? 'Yorumları aç' : 'Yorumları kapat',
        aciklama: ani.yorumlar_kapali ? 'Önceki yorumlar yeniden görünür' : 'Yorumlar gizlenir, yeni yorum yapılamaz',
        onSec: () =>
          void calistir(async () => {
            const guncel = await aniGuncelle(ani, { yorumlarKapali: !ani.yorumlar_kapali })
            onDegisti?.({ tur: 'guncellendi', ani: guncel })
          }),
      },
      {
        anahtar: 'arsiv',
        ikon: ani.arsivde ? 'ArchiveRestore' : 'Archive',
        etiket: ani.arsivde ? 'Arşivden çıkar' : 'Arşivle',
        aciklama: ani.arsivde ? 'Yeniden görünür olur' : 'Akıştan kalkar; Profil → Kaydedilen → Arşivlenen’de yalnızca sen görürsün',
        onSec: () =>
          void calistir(async () => {
            const guncel = await aniGuncelle(ani, { arsivde: !ani.arsivde })
            onDegisti?.({ tur: ani.arsivde ? 'arsivdenCikti' : 'arsivlendi', ani: guncel })
          }),
      },
      { anahtar: 'sil', ikon: 'Trash2', etiket: 'Sil', tehlikeli: true, onSec: () => setSilinsinMi(true) },
    )
  }
  if (etiketliyim && yanitlanabilir) {
    secenekler.push({
      anahtar: 'etiketim',
      ikon: 'UserMinus',
      etiket: 'Etiketimi kaldır',
      aciklama: 'Paylaşımda artık adın görünmez',
      onSec: () => void calistir(() => etiketimiKaldir(ani)),
    })
  }
  if (sikayetEdilebilir) {
    secenekler.push({ anahtar: 'sikayet', ikon: 'Flag', etiket: 'Şikâyet et', tehlikeli: true, onSec: () => setSikayetAcik(true) })
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 p-3">
        <Avatar ad={ad} foto={sahip?.avatar} emoji={sahip?.emoji} renk={sahip?.renk} boyut="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-700 truncate">{ad}</p>
          {(sahip?.kullanici_adi || grupAdi) && (
            <p className="text-xs text-ink-400 truncate">
              {[sahip?.kullanici_adi && `@${sahip.kullanici_adi}`, grupAdi].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {yeni && <span className="text-caption font-semibold text-brand-700 shrink-0">Yeni</span>}
        {ani.arsivde && (
          <span className="chip text-[11px] py-0.5 bg-ink-100 text-ink-500 shrink-0">
            <Icon name="Archive" className="w-3 h-3" />
            Arşivde
          </span>
        )}
        {secenekler.length > 0 && (
          <button
            type="button"
            onClick={() => setMenuAcik(true)}
            disabled={mesgul}
            aria-label="Paylaşım seçenekleri"
            aria-haspopup="dialog"
            title="Seçenekler"
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:text-ink-600 hover:bg-ink-50 shrink-0 transition-colors disabled:opacity-50"
          >
            <Icon name={mesgul ? 'Loader2' : 'Ellipsis'} className={`w-5 h-5 ${mesgul ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div
        className="relative aspect-square bg-mist-100 select-none [touch-action:manipulation]"
        onClick={dokunuldu}
      >
        <AniMedyaGalerisi ani={ani} />
        {kalp > 0 && (
          <span
            key={kalp}
            aria-hidden="true"
            onAnimationEnd={() => setKalp(0)}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="animate-kalp drop-shadow-[0_6px_18px_rgba(225,29,72,0.45)]">
              <Icon name="Heart" className="w-24 h-24 text-white fill-rose-500" strokeWidth={1.25} />
            </span>
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <Icon name="MapPin" className="w-4 h-4 text-ink-500 shrink-0" />
          <p className="text-body font-semibold text-ink-800 truncate flex-1">{ani.mekan_adi}</p>
          {ani.puan && <Yildizlar puan={ani.puan} />}
        </div>
        <p className="text-xs text-ink-400 mt-0.5">{formatDate(ani.tarih) ?? ani.tarih}</p>
        {etiketliler.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-ink-500 mt-1.5">
            <Icon name="Tag" className="w-3.5 h-3.5 text-bolum-koyu shrink-0" />
            <span className="min-w-0 truncate">
              {etiketliler.length === 1 && etiketliler[0] === benimId ? (
                <span className="font-semibold text-ink-600">Seninle</span>
              ) : (
                <>
                  <span className="font-semibold text-ink-600">{adListesi(etiketliler, profiller ?? new Map(), benimId)}</span> ile
                </>
              )}
            </span>
          </p>
        )}
        {ani.notlar && <p className="text-sm text-ink-500 mt-2">{ani.notlar}</p>}
        {hata && <p className="text-xs text-rose-600 mt-2">{hata}</p>}
      </div>
      {children}
      {menuAcik && <PaylasimMenusu baslik={ani.mekan_adi} secenekler={secenekler} onKapat={() => setMenuAcik(false)} />}
      {etiketAcik && (
        <EtiketDuzenle
          ani={ani}
          onKapat={() => setEtiketAcik(false)}
          onKaydedildi={(guncel) => onDegisti?.({ tur: 'guncellendi', ani: guncel })}
        />
      )}
      {(silinsinMi || sikayetAcik) && (
        <Katman>
          {silinsinMi && (
            // Above a memory opened large (AniPenceresi), which sits over
            // the dialog's own layer.
            <div className="relative z-[85]">
              <ConfirmDialog
                title="Paylaşım silinsin mi?"
                message="Fotoğraflar, yorumlar ve tepkiler herkesten kalkar. Bu geri alınamaz; sadece gizlemek istersen arşivle."
                onCancel={() => setSilinsinMi(false)}
                onConfirm={() => {
                  setSilinsinMi(false)
                  void calistir(async () => {
                    await aniSil(ani)
                    onDegisti?.({ tur: 'silindi', ani })
                  })
                }}
              />
            </div>
          )}
          {sikayetAcik && (
            <SikayetSayfasi
              hedef={{
                tur: 'ani',
                kisiId: ani.sahip_id,
                ad: sahip?.ad ?? null,
                kullaniciAdi: sahip?.kullanici_adi ?? null,
                metin: [ani.mekan_adi, ani.notlar].filter(Boolean).join(' — '),
                icerikId: ani.id,
              }}
              onKapat={() => setSikayetAcik(false)}
              onEngellendi={() => onEngellendi?.(ani.sahip_id)}
            />
          )}
        </Katman>
      )}
    </div>
  )
}

// The sharer changes who's tagged in a post that's already out.
function EtiketDuzenle({ ani, onKapat, onKaydedildi }: { ani: Ani; onKapat: () => void; onKaydedildi: (ani: Ani) => void }) {
  const adaylar = useEtiketAdaylari(etiketKitlesi(ani))
  return (
    <EtiketSecici
      adaylar={adaylar}
      secili={ani.etiketler}
      kaydetEtiketi="Kaydet"
      onKapat={onKapat}
      onKaydet={async (idler) => onKaydedildi(await aniGuncelle(ani, { etiketler: idler }))}
    />
  )
}

// The sharer's rating as small filled stars.
function Yildizlar({ puan }: { puan: number }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0" aria-label={`${puan} / ${AZAMI_PUAN} yıldız`}>
      {Array.from({ length: AZAMI_PUAN }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden>
          <path
            d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.15 6.38 20.1l1.07-6.27L2.9 9.4l6.3-.9z"
            fill={i < puan ? '#FBBF24' : '#E5E7EB'}
          />
        </svg>
      ))}
    </span>
  )
}
