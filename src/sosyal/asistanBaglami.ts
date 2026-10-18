import { arkadaslariGetir, arkadasMusaitligi, profilimiGetir, type Profil } from './api'
import { gruplarimiGetir, grupUyeleriGetir, type Grup } from './gruplar'
import { gunleriUret, kendiBloklarim } from './ortakPlan'

// What the assistant needs to plan with people: the user's friends and
// groups under short handles (k1, g1), with only their BUSY time ranges for
// the next two weeks, the same data the availability layer already shares.
// The handles go to the server; the maps back to accounts stay here (see
// api/_lib/asistanPlani.ts).

const GUN_SAYISI = 14

interface DoluBlok {
  tarih: string
  baslangic: string
  bitis: string
}

export interface AsistanBaglami {
  // Sent with every assistant message.
  istek: {
    benimAdim: string
    benimBloklarim: DoluBlok[]
    kisiler: Array<{
      ref: string
      ad: string
      kullaniciAdi: string | null
      arkadas: boolean
      paylasiyor: boolean
      bloklar: DoluBlok[]
    }>
    gruplar: Array<{ ref: string; ad: string; uyeler: string[] }>
  }
  kisiler: Map<string, Profil>
  gruplar: Map<string, Grup>
}

async function bloklari(p: Profil, ilk: string, son: string): Promise<DoluBlok[]> {
  if (!p.musaitlik_paylas) return []
  try {
    return (await arkadasMusaitligi(p.id, ilk, son)).map((b) => ({
      tarih: b.tarih,
      baslangic: b.baslangic.slice(0, 5),
      bitis: b.bitis.slice(0, 5),
    }))
  } catch {
    return []
  }
}

// Everything is read from the local copy of the social data, so this is
// quick enough to build before every message.
export async function asistanBaglamiHazirla(): Promise<AsistanBaglami> {
  const gunler = gunleriUret(GUN_SAYISI)
  const [ilk, son] = [gunler[0], gunler[gunler.length - 1]]

  const [ben, arkadaslar, gruplar, benimBloklarim] = await Promise.all([
    profilimiGetir(),
    arkadaslariGetir(),
    gruplarimiGetir(),
    kendiBloklarim(gunler),
  ])
  const benimId = ben?.id

  // Friends first, then group members who aren't friends; one handle each.
  const kisiler = new Map<string, { profil: Profil; arkadas: boolean }>()
  for (const a of arkadaslar) if (a.durum === 'kabul') kisiler.set(a.profil.id, { profil: a.profil, arkadas: true })
  const grupUyeleri = await Promise.all(gruplar.map((g) => grupUyeleriGetir(g.id).catch(() => [])))
  for (const uyeler of grupUyeleri) {
    for (const u of uyeler) {
      if (u.kullanici_id !== benimId && u.profil && !kisiler.has(u.kullanici_id)) {
        kisiler.set(u.kullanici_id, { profil: u.profil, arkadas: false })
      }
    }
  }

  const liste = [...kisiler.values()]
  const refler = new Map(liste.map((k, i) => [k.profil.id, `k${i + 1}`]))
  const blokListesi = await Promise.all(liste.map((k) => bloklari(k.profil, ilk, son)))

  return {
    istek: {
      benimAdim: ben?.ad ?? 'Ben',
      benimBloklarim,
      kisiler: liste.map((k, i) => ({
        ref: refler.get(k.profil.id)!,
        ad: k.profil.ad,
        kullaniciAdi: k.profil.kullanici_adi,
        arkadas: k.arkadas,
        paylasiyor: k.profil.musaitlik_paylas,
        bloklar: blokListesi[i],
      })),
      gruplar: gruplar.map((g, i) => ({
        ref: `g${i + 1}`,
        ad: g.ad,
        uyeler: grupUyeleri[i].flatMap((u) => refler.get(u.kullanici_id) ?? []),
      })),
    },
    kisiler: new Map(liste.map((k) => [refler.get(k.profil.id)!, k.profil])),
    gruplar: new Map(gruplar.map((g, i) => [`g${i + 1}`, g])),
  }
}
