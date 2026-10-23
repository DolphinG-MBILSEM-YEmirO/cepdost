import { eslesiyor } from '../lib/arama'
import { motor } from './cekirdek'
import { mesajlariGetir, profilleriGetir } from './gruplar'
import { direktMesajlariGetir, type Sohbet } from './mesajlar'

// Looking for a message across all my chats. Reads the local copy, with
// edits, deletions and "delete for me" already applied, so it finds what
// the chats show.

export interface MesajSonucu {
  sohbet: Sohbet
  mesajId: string
  gonderenAd: string
  metin: string
  olusturulma: string
}

// Enough to find something; a longer list is a sign to type more.
export const SONUC_SINIRI = 50

// `sorgu` comes from aramaSorgusu().
export async function mesajlardaAra(sorgu: string, sohbetler: Sohbet[], sinir = SONUC_SINIRI): Promise<MesajSonucu[]> {
  const benimId = motor().benimId
  const bulunanlar = await Promise.all(
    sohbetler
      .filter((s) => s.sonZaman)
      .map(async (s) => {
        const mesajlar = s.tur === 'grup' ? await mesajlariGetir(s.id, Infinity) : await direktMesajlariGetir(s.id, Infinity)
        return mesajlar
          .filter((m) => !m.silindi && m.metin && eslesiyor(m.metin, sorgu))
          .map((m) => ({ sohbet: s, mesajId: m.id, gonderenId: m.gonderen_id, metin: m.metin, olusturulma: m.olusturulma }))
      }),
  )
  const sonuclar = bulunanlar.flat().sort((a, b) => b.olusturulma.localeCompare(a.olusturulma)).slice(0, sinir)
  const profiller = await profilleriGetir(sonuclar.filter((r) => r.sohbet.tur === 'grup').map((r) => r.gonderenId))
  return sonuclar.map(({ gonderenId, ...r }) => ({
    ...r,
    gonderenAd:
      gonderenId === benimId ? 'Sen' : r.sohbet.tur === 'arkadas' ? r.sohbet.ad : (profiller.get(gonderenId)?.ad ?? 'Bir üye'),
  }))
}
