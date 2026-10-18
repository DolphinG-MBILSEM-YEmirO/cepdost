// A minimal Nostr relay pool (NIP-01): publish events, run one-off queries,
// and keep live subscriptions open across reconnects. Data is spread over
// several free public relays so the app keeps working when one is down.

export interface NostrOlayi {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface Filtre {
  kinds?: number[]
  authors?: string[]
  ids?: string[]
  since?: number
  until?: number
  limit?: number
  [etiket: `#${string}`]: string[] | undefined
}

// Free public relays that accept application data (kind 30078).
export const VARSAYILAN_ROLELER = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://offchain.pub',
]

const BAGLANMA_SURESI_MS = 4000
const YAYIN_SURESI_MS = 6000
const SORGU_SURESI_MS = 6000
const YENIDEN_BAGLANMA_MS = [2000, 5000, 15000, 30000]

const ROLE_ANAHTARI = 'cepdost-roleler'

// Relays can be overridden with ?relays=wss://a,wss://b (used for local
// testing). The choice is kept for the tab so in-app navigation keeps it.
export function ayarliRoleler(): string[] {
  try {
    const sorgu = new URLSearchParams(globalThis.location?.search ?? '').get('relays')
    if (sorgu) globalThis.sessionStorage?.setItem(ROLE_ANAHTARI, sorgu)
    const deger = sorgu ?? globalThis.sessionStorage?.getItem(ROLE_ANAHTARI)
    if (deger) {
      const liste = deger
        .split(',')
        .map((u) => u.trim())
        .filter((u) => /^wss?:\/\//.test(u))
      if (liste.length > 0) return liste
    }
  } catch {
    // No location/sessionStorage (tests, private mode): use the defaults.
  }
  return VARSAYILAN_ROLELER
}

type Mesaj = unknown[]
type Dinleyici = (mesaj: Mesaj) => void

class RoleBaglantisi {
  private soket: WebSocket | null = null
  private hazir: Promise<boolean> | null = null
  private dinleyiciler = new Set<Dinleyici>()
  // Live subscriptions, re-sent after every reconnect.
  private aboneler = new Map<string, Filtre[]>()
  private denemeSayisi = 0
  private zamanlayici: ReturnType<typeof setTimeout> | null = null
  private kapatildi = false
  readonly url: string

  constructor(url: string) {
    this.url = url
  }

  // Resolves with true when connected, false when the relay can't be reached.
  baglan(): Promise<boolean> {
    if (this.hazir) return this.hazir
    this.hazir = new Promise<boolean>((coz) => {
      let soket: WebSocket
      try {
        soket = new WebSocket(this.url)
      } catch {
        this.hazir = null
        coz(false)
        return
      }
      const zamanAsimi = setTimeout(() => {
        soket.close()
        coz(false)
      }, BAGLANMA_SURESI_MS)

      soket.addEventListener('open', () => {
        clearTimeout(zamanAsimi)
        this.denemeSayisi = 0
        for (const [id, filtreler] of this.aboneler) this.gonder(['REQ', id, ...filtreler])
        coz(true)
      })
      soket.addEventListener('message', (olay: MessageEvent) => {
        let veri: unknown
        try {
          veri = JSON.parse(String(olay.data))
        } catch {
          return
        }
        if (Array.isArray(veri)) this.dinleyiciler.forEach((d) => d(veri as Mesaj))
      })
      const sifirla = () => {
        clearTimeout(zamanAsimi)
        coz(false)
        if (this.soket === soket) {
          this.soket = null
          this.hazir = null
          this.yenidenBaglanmayiPlanla()
        }
      }
      soket.addEventListener('close', sifirla)
      soket.addEventListener('error', sifirla)
      this.soket = soket
    })
    return this.hazir
  }

  private yenidenBaglanmayiPlanla() {
    if (this.kapatildi || this.aboneler.size === 0 || this.zamanlayici) return
    const bekleme = YENIDEN_BAGLANMA_MS[Math.min(this.denemeSayisi, YENIDEN_BAGLANMA_MS.length - 1)]
    this.denemeSayisi++
    this.zamanlayici = setTimeout(() => {
      this.zamanlayici = null
      void this.baglan()
    }, bekleme)
  }

  gonder(mesaj: Mesaj) {
    if (this.soket?.readyState === 1) this.soket.send(JSON.stringify(mesaj))
  }

  dinle(dinleyici: Dinleyici): () => void {
    this.dinleyiciler.add(dinleyici)
    return () => this.dinleyiciler.delete(dinleyici)
  }

  aboneEkle(id: string, filtreler: Filtre[]) {
    this.aboneler.set(id, filtreler)
    if (this.soket?.readyState === 1) this.gonder(['REQ', id, ...filtreler])
    else void this.baglan()
  }

  aboneKaldir(id: string) {
    if (this.aboneler.delete(id)) this.gonder(['CLOSE', id])
  }

  kapat() {
    this.kapatildi = true
    if (this.zamanlayici) clearTimeout(this.zamanlayici)
    this.aboneler.clear()
    this.soket?.close()
  }
}

function aboneId(): string {
  return Math.random().toString(36).slice(2, 12)
}

export class RoleHavuzu {
  private baglantilar: RoleBaglantisi[]

  constructor(urller: string[]) {
    this.baglantilar = urller.map((u) => new RoleBaglantisi(u))
  }

  private async bagliOlanlar(): Promise<RoleBaglantisi[]> {
    const sonuc = await Promise.all(this.baglantilar.map((b) => b.baglan()))
    return this.baglantilar.filter((_, i) => sonuc[i])
  }

  // Sends a signed event to every relay; resolves with how many accepted it.
  async yayinla(olay: NostrOlayi): Promise<{ ulasilan: number; kabul: number }> {
    const roleler = await this.bagliOlanlar()
    const sonuclar = await Promise.all(
      roleler.map(
        (role) =>
          new Promise<boolean>((coz) => {
            const birak = role.dinle(([tur, id, kabul]) => {
              if (tur === 'OK' && id === olay.id) bitir(kabul === true)
            })
            const zamanAsimi = setTimeout(() => bitir(false), YAYIN_SURESI_MS)
            function bitir(sonuc: boolean) {
              clearTimeout(zamanAsimi)
              birak()
              coz(sonuc)
            }
            role.gonder(['EVENT', olay])
          }),
      ),
    )
    return { ulasilan: roleler.length, kabul: sonuclar.filter(Boolean).length }
  }

  // Collects matching events from every relay until each says it's done.
  async sorgula(filtreler: Filtre[]): Promise<{ ulasilan: number; olaylar: NostrOlayi[] }> {
    const roleler = await this.bagliOlanlar()
    const olaylar = new Map<string, NostrOlayi>()
    await Promise.all(
      roleler.map(
        (role) =>
          new Promise<void>((coz) => {
            const id = aboneId()
            const birak = role.dinle(([tur, gelenId, yuk]) => {
              if (gelenId !== id) return
              if (tur === 'EVENT' && yuk && typeof (yuk as NostrOlayi).id === 'string') {
                olaylar.set((yuk as NostrOlayi).id, yuk as NostrOlayi)
              }
              if (tur === 'EOSE' || tur === 'CLOSED') bitir()
            })
            const zamanAsimi = setTimeout(bitir, SORGU_SURESI_MS)
            function bitir() {
              clearTimeout(zamanAsimi)
              birak()
              role.gonder(['CLOSE', id])
              coz()
            }
            role.gonder(['REQ', id, ...filtreler])
          }),
      ),
    )
    return { ulasilan: roleler.length, olaylar: [...olaylar.values()] }
  }

  // Keeps a subscription open on every relay (re-sent after reconnects) and
  // calls `geldi` for each event. The same event can arrive from several
  // relays; callers dedupe by id.
  abone(filtreler: Filtre[], geldi: (olay: NostrOlayi) => void): () => void {
    const id = aboneId()
    const birakicilar = this.baglantilar.map((role) => {
      const birak = role.dinle(([tur, gelenId, yuk]) => {
        if (tur === 'EVENT' && gelenId === id && yuk && typeof (yuk as NostrOlayi).id === 'string') {
          geldi(yuk as NostrOlayi)
        }
      })
      role.aboneEkle(id, filtreler)
      return () => {
        birak()
        role.aboneKaldir(id)
      }
    })
    return () => birakicilar.forEach((b) => b())
  }

  kapat() {
    this.baglantilar.forEach((b) => b.kapat())
  }
}
