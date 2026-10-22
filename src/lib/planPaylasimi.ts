import { db, goruntulemeBasligi, kayitDegistir, kayitGuncelle, kayitOlustur, kayitSil, type Kategori, type Kayit, type Oncelik, type YakinOneri } from '../db'
import { davetGonder, davetYanitla, type PlanDaveti } from '../sosyal/api'
import { direktMesajGonder } from '../sosyal/mesajlar'
import { grupPlaniOlustur, mesajGonder, planaYanitVer, type Grup, type GrupPlani, type YanitDurumu } from '../sosyal/gruplar'
import { davetiGuncelle, davetiSil } from '../sosyal/davet'
import {
  linkPlaniniGuncelle,
  linkPlaniniIptalEt,
  type LinkKaynagi,
  type LinkPlani,
  type LinkYaniti,
} from '../sosyal/planLinki'
import type { SosyalMotor } from '../sosyal/nostr/motor'
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
      tumGun: davet.tum_gun,
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

// Who a new plan is for.
export type PlanKitlesi =
  | { tur: 'tek' }
  | { tur: 'arkadaslar'; kisiler: ReadonlyArray<{ id: string; ad: string }> }
  | { tur: 'grup'; grup: Grup }

export interface KurulacakPlan {
  baslik: string
  tarih: string | null
  saat: string | null
  sure: number | null
  // Takes the whole day; the time and duration are dropped.
  tumGun?: boolean
  konum: string | null
  // Goes to friends with the invite (or into the group plan) and into my
  // calendar entry's note.
  not: string | null
  emoji: string | null
  kategori?: Kategori
  oncelik?: Oncelik
  yakinOneriler?: YakinOneri[] | null
}

const DAVET_MESAJI = 'Bir plan önerdim 👇'
const GRUP_PLANI_MESAJI = 'Yeni bir plan 👇'

// Sets up a new plan in one go: the group plan or the invites (each with a
// card in the chat), then my own calendar entry, linked so later answers and
// the photo prompt find it. The "+" flow, the AI planner, the assistant and
// a friend's availability screen all end here.
export async function planiKur(plan: KurulacakPlan, kitle: PlanKitlesi, sohbetMesaji?: string): Promise<void> {
  const tumGun = plan.tumGun === true
  const ortak = {
    baslik: plan.baslik,
    saat: !tumGun && plan.saat ? plan.saat.slice(0, 5) : null,
    sure: tumGun ? null : plan.sure,
    tumGun,
    konum: plan.konum,
    emoji: plan.emoji,
  }
  if (kitle.tur !== 'tek' && !plan.tarih) throw new Error('Paylaşmak için plana bir tarih ver.')

  let grupPlanId: string | null = null
  const gidenDavetler: string[] = []
  if (kitle.tur === 'grup') {
    grupPlanId = await grupPlaniOlustur({ ...ortak, tarih: plan.tarih!, grupId: kitle.grup.id, notlar: plan.not })
    // Whoever sets it up is coming.
    await planaYanitVer(grupPlanId, 'geliyorum')
    // The card is a convenience; the plan already exists.
    await mesajGonder(kitle.grup.id, sohbetMesaji ?? GRUP_PLANI_MESAJI, grupPlanId).catch(() => {})
  } else if (kitle.tur === 'arkadaslar') {
    for (const k of kitle.kisiler) {
      const davetId = await davetGonder({ ...ortak, tarih: plan.tarih!, alanId: k.id, mesaj: plan.not })
      gidenDavetler.push(davetId)
      await direktMesajGonder(k.id, sohbetMesaji ?? DAVET_MESAJI, davetId).catch(() => {})
    }
  }

  // With one friend the "how was it?" photo can go to our shared archive;
  // with several the target would be unclear.
  const tekKisi = kitle.tur === 'arkadaslar' && kitle.kisiler.length === 1 ? kitle.kisiler[0] : null
  await kayitOlustur({
    ...ortakAlanlar(),
    ...ortak,
    baslik: kitle.tur === 'grup' ? `${plan.baslik} (${kitle.grup.ad})` : plan.baslik,
    tarih: plan.tarih,
    kategori: plan.kategori ?? 'etkinlik',
    oncelik: plan.oncelik ?? 'orta',
    yakinOneriler: plan.yakinOneriler ?? null,
    ozetNot: plan.not,
    grupId: kitle.tur === 'grup' ? kitle.grup.id : null,
    grupAdi: kitle.tur === 'grup' ? kitle.grup.ad : null,
    grupPlanId,
    arkadasId: tekKisi?.id ?? null,
    arkadasAdi: tekKisi?.ad ?? null,
    gidenDavetler,
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
      tumGun: plan.tum_gun,
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

// Answering someone's plan link while signed in: "coming" puts the plan in
// my calendar (before answering, as with invites), anything else takes it
// out again.
export async function linkPlaniniYanitla(
  m: SosyalMotor,
  link: LinkKaynagi,
  plan: LinkPlani,
  ad: string,
  yanit: LinkYaniti,
): Promise<void> {
  const mevcut = await yerelKayit((k) => k.linkAnahtari === link.id)
  if (yanit === 'geliyorum' && !mevcut && !plan.iptal) {
    await kayitOlustur({
      ...ortakAlanlar(),
      baslik: plan.baslik,
      tarih: plan.tarih,
      saat: plan.saat,
      tumGun: plan.tum_gun,
      konum: plan.konum,
      sure: plan.sure,
      ozetNot: plan.not,
      emoji: plan.emoji,
      linkAnahtari: link.id,
      linkSahibi: link.sahip,
    })
  }
  await link.yanitVer(m, plan, ad, yanit)
  if (yanit !== 'geliyorum' && mevcut) await kayitSil(mevcut.id)
}

// "I want to go too" on a memory: the place becomes an idea in my calendar,
// with no day yet, to plan when I like. Asking twice keeps the one idea.
export async function anidanPlan(yer: string, kimden: string | null): Promise<{ kayit: Kayit; yeni: boolean }> {
  const konum = yer.trim().replace(/\s+/g, ' ')
  const ayni = (k: Kayit) => k.durum === 'bekliyor' && !k.tarih && k.konum?.trim().toLocaleLowerCase('tr-TR') === konum.toLocaleLowerCase('tr-TR')
  const mevcut = await yerelKayit(ayni)
  if (mevcut) return { kayit: mevcut, yeni: false }
  const kayit = await kayitOlustur({
    ...ortakAlanlar(),
    kategori: 'mekan',
    baslik: konum,
    emoji: '📍',
    tarih: null,
    saat: null,
    sure: null,
    konum,
    ozetNot: kimden ? `${kimden} buradan bir anı paylaştı.` : 'Akıştaki bir anıdan.',
  })
  return { kayit, yeni: true }
}

// Editing or deleting one of my plans: if it went out as a link, the link
// follows (in the background; the change here never waits on the network).
export async function planiGuncelle(kayit: Kayit, degisiklik: Partial<Kayit>): Promise<void> {
  await kayitGuncelle(kayit.id, degisiklik)
  paylasimlariGuncelle(kayit, degisiklik)
}

// The link and the Davet invite of a plan changed here take the change too.
// For writers that change several plans in one transaction first.
export function paylasimlariGuncelle(kayit: Kayit, degisiklik: Partial<Kayit>): void {
  if (kayit.planLinki) void linkPlaniniGuncelle({ ...kayit, ...degisiklik }).catch(() => {})
  if (kayit.davetLinki) void davetiGuncelle({ ...kayit, ...degisiklik }).catch(() => {})
}

export async function planiSil(kayit: Kayit): Promise<void> {
  await kayitSil(kayit.id)
  if (kayit.planLinki) void linkPlaniniIptalEt(kayit).catch(() => {})
  if (kayit.davetLinki) void davetiSil(kayit).catch(() => {})
}

// The calendar entry I got from a plan link, if I said I'm coming.
export function linkKaydi(id: string): Promise<Kayit | undefined> {
  return yerelKayit((k) => k.linkAnahtari === id)
}

// Plans from my calendar that can be shared: upcoming, not done, with a
// date, and not themselves something someone shared with me.
export function paylasilabilirPlanlar(kayitlar: Kayit[]): Kayit[] {
  const bugun = localDateString()
  return kayitlar
    .filter(
      (k) => k.durum === 'bekliyor' && k.tarih && k.tarih >= bugun && !k.davetId && !k.grupPlanId && !k.linkAnahtari,
    )
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
    saat: kayit.tumGun ? null : kayit.saat,
    sure: kayit.tumGun ? null : kayit.sure,
    tumGun: kayit.tumGun === true,
    konum: kayit.konum,
    emoji: kayit.emoji ?? null,
  }

  if (hedef.tur === 'arkadas') {
    const davetId = await davetGonder({ ...plan, alanId: hedef.id, mesaj: kayit.ozetNot })
    // Its page lists who was invited. Read fresh: sending to several
    // friends in a row passes the same old copy each time.
    await kayitDegistir(kayit.id, (k) => ({ gidenDavetler: [...(k.gidenDavetler ?? []), davetId] }))
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
