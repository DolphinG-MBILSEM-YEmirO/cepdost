import { goruntulemeBasligi, type Kayit } from '../db'
import { UYGULAMA_ADI } from '../../shared/marka'
import { benimProfilVerim, motor } from './cekirdek'
import { davetleriGetir, davetleriIdyeGoreGetir, type DavetDurumu, type Profil } from './api'
import { grupUyeleriGetir, planYanitlariGetir, planlariIdyeGoreGetir, profilleriGetir, type YanitDurumu } from './gruplar'
import { bildir } from './bildirimler'

// Who is on one of my plans and where each of them stands, read from the
// group plan's answers or from the invites behind it. Shown on the plan's
// page; the plan's owner can nudge the people who haven't answered.

export type KatilimDurumu = 'geliyor' | 'belki' | 'gelmiyor' | 'bekliyor'

export interface Katilimci {
  id: string
  ad: string
  profil: Profil | null
  durum: KatilimDurumu
  ben: boolean
  sahip: boolean
}

export interface PlanKatilimi {
  // A group plan, or invites between friends.
  tur: 'grup' | 'davet'
  katilimcilar: Katilimci[]
  // The chat the plan lives in ('grup:<id>' or 'dm:<id>'), if there is one.
  sohbet: string | null
  // I set the plan up, so nudging is mine to do.
  sahibiyim: boolean
  // The invite was withdrawn by whoever sent it.
  iptal: boolean
}

const SIRA: Record<KatilimDurumu, number> = { geliyor: 0, belki: 1, bekliyor: 2, gelmiyor: 3 }

function sirala(liste: Katilimci[]): Katilimci[] {
  return liste.sort((a, b) => SIRA[a.durum] - SIRA[b.durum] || Number(b.sahip) - Number(a.sahip) || a.ad.localeCompare(b.ad, 'tr'))
}

const YANITTAN: Record<YanitDurumu, KatilimDurumu> = { geliyorum: 'geliyor', belki: 'belki', gelmiyorum: 'gelmiyor' }
const DAVETTEN: Record<DavetDurumu, KatilimDurumu> = { kabul: 'geliyor', red: 'gelmiyor', bekliyor: 'bekliyor', iptal: 'gelmiyor' }

async function grupKatilimi(planId: string, benimId: string): Promise<PlanKatilimi | null> {
  const plan = (await planlariIdyeGoreGetir([planId])).get(planId)
  if (!plan) return null
  const [uyeler, yanitlar] = await Promise.all([grupUyeleriGetir(plan.grup_id), planYanitlariGetir([planId])])
  const yanitHaritasi = new Map(yanitlar.map((y) => [y.kullanici_id, y.durum]))
  const katilimcilar = uyeler.map((u) => {
    const yanit = yanitHaritasi.get(u.kullanici_id)
    return {
      id: u.kullanici_id,
      ad: u.profil?.ad ?? 'Bir üye',
      profil: u.profil,
      durum: yanit ? YANITTAN[yanit] : 'bekliyor',
      ben: u.kullanici_id === benimId,
      sahip: u.kullanici_id === plan.olusturan_id,
    }
  })
  return {
    tur: 'grup',
    katilimcilar: sirala(katilimcilar),
    sohbet: `grup:${plan.grup_id}`,
    sahibiyim: plan.olusturan_id === benimId,
    iptal: false,
  }
}

// An invite someone sent me (and I accepted): the host and me. The others
// they invited aren't visible to me; invites go one to one.
async function gelenDavetKatilimi(davetId: string, benimId: string): Promise<PlanKatilimi | null> {
  const davet = (await davetleriIdyeGoreGetir([davetId])).get(davetId)
  if (!davet) return null
  const profiller = await profilleriGetir([davet.gonderen_id, benimId])
  const kisi = (id: string, durum: KatilimDurumu, sahip: boolean): Katilimci => ({
    id,
    ad: profiller.get(id)?.ad ?? (id === benimId ? 'Sen' : 'Arkadaşın'),
    profil: profiller.get(id) ?? null,
    durum,
    ben: id === benimId,
    sahip,
  })
  return {
    tur: 'davet',
    katilimcilar: sirala([kisi(davet.gonderen_id, 'geliyor', true), kisi(benimId, DAVETTEN[davet.durum], false)]),
    sohbet: `dm:${davet.gonderen_id}`,
    sahibiyim: false,
    iptal: davet.durum === 'iptal',
  }
}

// Plans set up before their page listed invites: the invites I sent with
// the same title and day.
async function eslesenDavetler(kayit: Kayit): Promise<string[]> {
  if (!kayit.tarih) return []
  const baslik = goruntulemeBasligi(kayit)
  const { giden } = await davetleriGetir()
  return giden.filter((d) => d.tarih === kayit.tarih && d.baslik === baslik).map((d) => d.id)
}

async function gidenDavetKatilimi(davetIdleri: string[], benimId: string): Promise<PlanKatilimi | null> {
  const davetler = [...(await davetleriIdyeGoreGetir(davetIdleri)).values()].filter((d) => d.durum !== 'iptal')
  if (davetler.length === 0) return null
  const profiller = await profilleriGetir([benimId, ...davetler.map((d) => d.alan_id)])
  const katilimcilar: Katilimci[] = [
    { id: benimId, ad: profiller.get(benimId)?.ad ?? 'Sen', profil: profiller.get(benimId) ?? null, durum: 'geliyor', ben: true, sahip: true },
    ...davetler.map((d) => ({
      id: d.alan_id,
      ad: profiller.get(d.alan_id)?.ad ?? 'Arkadaşın',
      profil: profiller.get(d.alan_id) ?? null,
      durum: DAVETTEN[d.durum],
      ben: false,
      sahip: false,
    })),
  ]
  return {
    tur: 'davet',
    katilimcilar: sirala(katilimcilar),
    // One friend: our chat. Several: there's no single chat to open.
    sohbet: davetler.length === 1 ? `dm:${davetler[0].alan_id}` : null,
    sahibiyim: true,
    iptal: false,
  }
}

export async function planKatilimi(kayit: Kayit): Promise<PlanKatilimi | null> {
  const benimId = motor().benimId
  if (kayit.grupPlanId) return grupKatilimi(kayit.grupPlanId, benimId)
  if (kayit.davetId) return gelenDavetKatilimi(kayit.davetId, benimId)
  const davetIdleri = kayit.gidenDavetler?.length ? kayit.gidenDavetler : await eslesenDavetler(kayit)
  return davetIdleri.length ? gidenDavetKatilimi(davetIdleri, benimId) : null
}

export function yanitsizlar(katilim: PlanKatilimi): Katilimci[] {
  return katilim.katilimcilar.filter((k) => k.durum === 'bekliyor' && !k.ben)
}

// A gentle push to everyone who hasn't answered yet. Returns how many
// devices it reached (0: none of them has notifications on).
export async function yanitsizlariDurt(kayit: Kayit, katilim: PlanKatilimi): Promise<number> {
  const alicilar = yanitsizlar(katilim).map((k) => k.id)
  if (alicilar.length === 0) return 0
  const benimId = motor().benimId
  const ad = (await benimProfilVerim())?.ad ?? UYGULAMA_ADI
  const baslik = goruntulemeBasligi(kayit).slice(0, 120)
  // A group plan opens the group; an invite opens the chat with me.
  const git = katilim.tur === 'grup' && katilim.sohbet ? katilim.sohbet : `dm:${benimId}`
  return bildir(alicilar, {
    tur: katilim.tur === 'grup' ? 'grup' : 'davet',
    baslik: ad,
    govde: `Yanıtını bekliyor: ${baslik}`,
    git,
    etiket: `durt:${kayit.grupPlanId ?? kayit.id}`,
  })
}
