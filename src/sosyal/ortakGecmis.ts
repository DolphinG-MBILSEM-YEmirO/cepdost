import type { Kayit } from '../db'
import { davetleriIdyeGoreGetir } from './api'
import { planYanitlariGetir } from './gruplar'

// Which plans in my calendar a friend is on: invites between us (either
// way, minus the ones they turned down), their plan links I said I'm
// coming to, and group plans they said they're coming to. Read from the
// local copy of the social records, so it's quick and works offline.
export async function arkadasPlandaMi(arkadasId: string, kayitlar: Kayit[]): Promise<(kayit: Kayit) => boolean> {
  return (await plandakiArkadaslar(kayitlar))(arkadasId)
}

// The same for every friend at once, from one read (the friends list).
export async function plandakiArkadaslar(kayitlar: Kayit[]): Promise<(arkadasId: string) => (kayit: Kayit) => boolean> {
  const grupPlanlari = kayitlar.flatMap((k) => (k.grupPlanId ? [k.grupPlanId] : []))
  const davetler = kayitlar.flatMap((k) => k.gidenDavetler ?? [])
  const [yanitlar, davetHaritasi] = await Promise.all([
    grupPlanlari.length ? planYanitlariGetir(grupPlanlari) : Promise.resolve([]),
    davetler.length ? davetleriIdyeGoreGetir(davetler) : Promise.resolve(new Map()),
  ])

  // Who said they're coming to each group plan.
  const gelenler = new Map<string, Set<string>>()
  for (const y of yanitlar) {
    if (y.durum !== 'geliyorum') continue
    const kisiler = gelenler.get(y.plan_id) ?? new Set<string>()
    kisiler.add(y.kullanici_id)
    gelenler.set(y.plan_id, kisiler)
  }
  // My invites: who each went to, and whether they said yes.
  const davetDurumu = new Map<string, { alan: string; kabul: boolean }>()
  for (const d of davetHaritasi.values()) davetDurumu.set(d.id, { alan: d.alan_id, kabul: d.durum === 'kabul' })

  return (arkadasId) => (k) => {
    if (k.grupPlanId) return gelenler.get(k.grupPlanId)?.has(arkadasId) ?? false
    const onaDavetler = (k.gidenDavetler ?? []).flatMap((id) => {
      const d = davetDurumu.get(id)
      return d?.alan === arkadasId ? [d] : []
    })
    if (onaDavetler.length > 0) return onaDavetler.some((d) => d.kabul)
    // Their invite I accepted, their link, or a plan from before invites
    // were kept on the plan.
    return k.arkadasId === arkadasId || k.linkSahibi === arkadasId
  }
}
