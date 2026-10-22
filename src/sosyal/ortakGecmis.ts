import type { Kayit } from '../db'
import { davetleriIdyeGoreGetir } from './api'
import { planYanitlariGetir } from './gruplar'

// Which plans in my calendar a friend is on: invites between us (either
// way, minus the ones they turned down), their plan links I said I'm
// coming to, and group plans they said they're coming to. Read from the
// local copy of the social records, so it's quick and works offline.
export async function arkadasPlandaMi(arkadasId: string, kayitlar: Kayit[]): Promise<(kayit: Kayit) => boolean> {
  const grupPlanlari = kayitlar.flatMap((k) => (k.grupPlanId ? [k.grupPlanId] : []))
  const davetler = kayitlar.flatMap((k) => k.gidenDavetler ?? [])
  const [yanitlar, davetHaritasi] = await Promise.all([
    grupPlanlari.length ? planYanitlariGetir(grupPlanlari) : Promise.resolve([]),
    davetler.length ? davetleriIdyeGoreGetir(davetler) : Promise.resolve(new Map()),
  ])

  const geldigiGrupPlanlari = new Set(
    yanitlar.filter((y) => y.kullanici_id === arkadasId && y.durum === 'geliyorum').map((y) => y.plan_id),
  )
  // My invites to them, by whether they said yes.
  const davetiKabul = new Map<string, boolean>()
  for (const d of davetHaritasi.values()) if (d.alan_id === arkadasId) davetiKabul.set(d.id, d.durum === 'kabul')

  return (k) => {
    if (k.grupPlanId) return geldigiGrupPlanlari.has(k.grupPlanId)
    const onaDavetler = (k.gidenDavetler ?? []).filter((id) => davetiKabul.has(id))
    if (onaDavetler.length > 0) return onaDavetler.some((id) => davetiKabul.get(id))
    // Their invite I accepted, their link, or a plan from before invites
    // were kept on the plan.
    return k.arkadasId === arkadasId || k.linkSahibi === arkadasId
  }
}
