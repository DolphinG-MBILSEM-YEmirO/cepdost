import { db, goruntulemeBasligi, kayitGuncelle, kayitOlustur, kayitSil, type Kayit } from '../db'
import { davetGonder, davetYanitla, type PlanDaveti } from '../sosyal/api'
import { direktMesajGonder } from '../sosyal/mesajlar'
import { grupPlaniOlustur, mesajGonder, planaYanitVer, type Grup, type GrupPlani, type YanitDurumu } from '../sosyal/gruplar'
import { localDateString } from './format'

// Sharing plans in chats, and keeping my own calendar in step with my
// answers.
//
// A shared plan lives in two places: the social record (a friend's invite
// or a group plan) and a local record in my calendar. Every screen that
// answers or shares a plan (chat cards, the group's plan list, the invite
// list, the record detail) goes through these helpers, so they all behave
// the same way.

export type PaylasimHedefi = { tur: 'arkadas'; id: string; ad: string } | { tur: 'grup'; grup: Grup }

const PAYLASIM_MESAJI = 'Bir plan paylaştım 👇'

// Fields every calendar entry made from a shared plan has in common.
function ortakAlanlar() {
  return {
    kategori: 'etkinlik' as const,
    oncelik: 'orta' as const,
    mekanOnerisi: null,
    yakinOneriler: null,
    kaynakTipi: 'metin' as const,
    hamBaslik: '',
    hamMetin: '',
    hamLink: '',
    gorseller: [],
  }
}

async function yerelKayit(eslesir: (k: Kayit) => boolean): Promise<Kayit | undefined> {
  return (await db.kayitlar.toArray()).find(eslesir)
}

// The calendar entry I got by accepting this invite, if there is one.
export function davetKaydi(davetId: string): Promise<Kayit | undefined> {
  return yerelKayit((k) => k.davetId === davetId)
}

export function planGectiMi(tarih: string): boolean {
  return tarih < localDateString()
}

// Accepting puts the plan in my calendar (before answering, so a failed
// upload never loses it); declining, even after accepting, takes it out.
export async function davetiYanitla(davet: PlanDaveti, kabul: boolean, gonderenAd: string | null): Promise<void> {
  const mevcut = await davetKaydi(davet.id)
  if (kabul && !mevcut) {
    await kayitOlustur({
      ...ortakAlanlar(),
      baslik: davet.baslik,
      tarih: davet.tarih,
      saat: davet.saat ? davet.saat.slice(0, 5) : null,
      konum: davet.konum,
      sure: davet.sure,
      ozetNot: davet.mesaj,
      emoji: davet.emoji,
      // So the "how was it?" photo prompt goes to the right archive.
      arkadasId: davet.gonderen_id,
      arkadasAdi: gonderenAd,
      davetId: davet.id,
    })
  }
  await davetYanitla(davet.id, kabul)
  if (!kabul && mevcut) await kayitSil(mevcut.id)
}

// My own copy of a plan I invited one friend to: I'm coming either way, so
// it goes in my calendar (and my shared availability) right away.
export async function davetimiTakvimeEkle(
  davet: { baslik: string; tarih: string; saat: string | null; sure: number | null; konum: string | null; mesaj: string | null; emoji: string | null },
  arkadas: { id: string; ad: string },
): Promise<void> {
  await kayitOlustur({
    ...ortakAlanlar(),
    baslik: davet.baslik,
    tarih: davet.tarih,
    saat: davet.saat ? davet.saat.slice(0, 5) : null,
    konum: davet.konum,
    sure: davet.sure,
    ozetNot: davet.mesaj,
    emoji: davet.emoji,
    arkadasId: arkadas.id,
    arkadasAdi: arkadas.ad,
  })
}

// Group plan answer + my calendar.
//
// The test is "is there a local record for this plan", not "what was my
// previous answer": going coming → maybe → coming must not add a second
// copy. Leaving "coming" removes the record, so a plan I'm not going to
// doesn't fill my calendar or my shared availability.
export async function grupPlaniYanitla(plan: GrupPlani, durum: YanitDurumu, grup: Grup): Promise<void> {
  await planaYanitVer(plan.id, durum)
  const mevcut = await yerelKayit((k) => k.grupPlanId === plan.id)

  if (durum === 'geliyorum') {
    if (mevcut) return
    await kayitOlustur({
      ...ortakAlanlar(),
      baslik: `${plan.baslik} (${grup.ad})`,
      tarih: plan.tarih,
      saat: plan.saat ? plan.saat.slice(0, 5) : null,
      konum: plan.konum,
      sure: plan.sure,
      ozetNot: plan.notlar,
      emoji: plan.emoji,
      grupId: grup.id,
      grupAdi: grup.ad,
      grupPlanId: plan.id,
    })
  } else if (mevcut) {
    await kayitSil(mevcut.id)
  }
}

// Plans from my calendar that can be shared: upcoming, not done, with a
// date, and not themselves something someone shared with me.
export function paylasilabilirPlanlar(kayitlar: Kayit[]): Kayit[] {
  const bugun = localDateString()
  return kayitlar
    .filter((k) => k.durum === 'bekliyor' && k.tarih && k.tarih >= bugun && !k.davetId && !k.grupPlanId)
    .sort((a, b) => `${a.tarih}${a.saat ?? '99'}`.localeCompare(`${b.tarih}${b.saat ?? '99'}`))
}

// Sends one of my plans to a friend (as an invite) or a group (as a group
// plan I'm coming to), drops it into that chat as a card, and links my
// record to it so the photo prompt and later answers find their way.
export async function planiPaylas(kayit: Kayit, hedef: PaylasimHedefi): Promise<void> {
  if (!kayit.tarih) throw new Error('Paylaşmak için plana bir tarih ver.')
  const plan = {
    baslik: goruntulemeBasligi(kayit),
    tarih: kayit.tarih,
    saat: kayit.saat,
    sure: kayit.sure,
    konum: kayit.konum,
    emoji: kayit.emoji ?? null,
  }

  if (hedef.tur === 'arkadas') {
    const davetId = await davetGonder({ ...plan, alanId: hedef.id, mesaj: kayit.ozetNot })
    // The invite already went out; the chat card is a convenience.
    await direktMesajGonder(hedef.id, PAYLASIM_MESAJI, davetId).catch(() => {})
    if (!kayit.arkadasId && !kayit.grupId) await kayitGuncelle(kayit.id, { arkadasId: hedef.id, arkadasAdi: hedef.ad })
    return
  }

  const planId = await grupPlaniOlustur({ ...plan, grupId: hedef.grup.id, notlar: kayit.ozetNot })
  await planaYanitVer(planId, 'geliyorum')
  await mesajGonder(hedef.grup.id, PAYLASIM_MESAJI, planId).catch(() => {})
  if (!kayit.grupPlanId) {
    await kayitGuncelle(kayit.id, { grupId: hedef.grup.id, grupAdi: hedef.grup.ad, grupPlanId: planId })
  }
}
