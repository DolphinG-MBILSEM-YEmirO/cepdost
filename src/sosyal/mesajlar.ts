import { sb } from './supabase'
import { arkadaslariGetir, type Profil } from './api'
import { gruplarimiGetir, mesajlariGetir, type Grup } from './gruplar'

// F13: arkadaşlarla birebir mesajlaşma + Sohbet sekmesinin birleşik
// listesi. Yetkilendirme yine tamamen RLS'te (bkz. direkt_mesajlar
// politikaları) — buradaki bir hata yetki açığına dönüşemez.

export interface DirektMesaj {
  id: string
  gonderen_id: string
  alan_id: string
  metin: string
  // Doluysa mesaj sohbette plan daveti kartı olarak gösterilir. RLS davetin
  // aynı iki kişi arasında olmasını şart koşuyor
  // (bkz. private.davet_bu_sohbette_mi).
  davet_id: string | null
  okundu: boolean
  olusturulma: string
}

const DM_ALANLARI = 'id, gonderen_id, alan_id, metin, davet_id, okundu, olusturulma'

// Bir arkadaşla olan yazışma. RLS zaten sadece taraf olduğum satırları
// döndürüyor; buradaki filtre "bu kişiyle olanlar" demek.
export async function direktMesajlariGetir(arkadasId: string, limit = 100): Promise<DirektMesaj[]> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) return []

  const { data, error } = await sb()
    .from('direkt_mesajlar')
    .select(DM_ALANLARI)
    .or(
      `and(gonderen_id.eq.${benimId},alan_id.eq.${arkadasId}),` +
        `and(gonderen_id.eq.${arkadasId},alan_id.eq.${benimId})`,
    )
    .order('olusturulma', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  // En yeniden çekip ters çeviriyoruz: limit son mesajlara uygulanmalı
  // ama ekranda eskiden yeniye sıralı görünmeli.
  return ((data ?? []) as DirektMesaj[]).reverse()
}

// davetId verilirse mesaj sohbette plan kartı olarak görünür.
export async function direktMesajGonder(
  arkadasId: string,
  metin: string,
  davetId?: string | null,
): Promise<void> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { error } = await sb()
    .from('direkt_mesajlar')
    .insert({
      gonderen_id: benimId,
      alan_id: arkadasId,
      metin: metin.trim(),
      davet_id: davetId ?? null,
    })
  if (error) {
    if (error.code === '42501') {
      throw new Error('Bu kişiye mesaj gönderemezsin — önce arkadaş olmanız gerekiyor.')
    }
    throw new Error(error.message)
  }
}

export async function okunduIsaretle(arkadasId: string): Promise<void> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) return

  await sb()
    .from('direkt_mesajlar')
    .update({ okundu: true })
    .eq('alan_id', benimId)
    .eq('gonderen_id', arkadasId)
    .eq('okundu', false)
}

// Realtime: karşı taraftan gelen yeni mesaj. Filtre "bana gelenler" —
// kendi gönderdiğimi zaten yerelde ekliyoruz.
export function direktMesajlariDinle(
  benimId: string,
  geldi: (m: DirektMesaj) => void,
): () => void {
  const kanal = sb()
    .channel(`dm-${benimId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'direkt_mesajlar',
        filter: `alan_id=eq.${benimId}`,
      },
      (yuk) => geldi(yuk.new as DirektMesaj),
    )
    .subscribe()

  return () => {
    void sb().removeChannel(kanal)
  }
}

// ---------- birleşik sohbet listesi ----------

export interface Sohbet {
  tur: 'arkadas' | 'grup'
  id: string
  ad: string
  kullaniciAdi: string | null
  avatarYol: string | null
  sonMesaj: string | null
  sonZaman: string | null
  okunmamis: number
  profil?: Profil
  grup?: Grup
}

// Arkadaşları ve grupları tek listede, son mesaja göre sıralı döner.
// Hiç yazışılmamış arkadaş/grup da listede kalır (boş sohbet olarak) —
// yoksa yeni bir sohbet başlatmanın yolu olmazdı.
export async function sohbetleriGetir(): Promise<Sohbet[]> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) return []

  const [arkadaslar, gruplar] = await Promise.all([arkadaslariGetir(), gruplarimiGetir()])
  const kabulEdilmis = arkadaslar.filter((a) => a.durum === 'kabul')

  // Tüm DM'leri tek sorguda çekip istemcide grupluyoruz — arkadaş başına
  // ayrı sorgu atmak, arkadaş sayısı arttıkça gereksiz yük olurdu.
  const { data: dmSatirlar } = await sb()
    .from('direkt_mesajlar')
    .select(DM_ALANLARI)
    .order('olusturulma', { ascending: false })
    .limit(500)

  const dmler = (dmSatirlar ?? []) as DirektMesaj[]
  const sonDm = new Map<string, DirektMesaj>()
  const okunmamisSayi = new Map<string, number>()

  for (const m of dmler) {
    const karsi = m.gonderen_id === benimId ? m.alan_id : m.gonderen_id
    if (!sonDm.has(karsi)) sonDm.set(karsi, m)
    if (m.alan_id === benimId && !m.okundu) {
      okunmamisSayi.set(karsi, (okunmamisSayi.get(karsi) ?? 0) + 1)
    }
  }

  const arkadasSohbetleri: Sohbet[] = kabulEdilmis.map((a) => {
    const son = sonDm.get(a.profil.id)
    return {
      tur: 'arkadas',
      id: a.profil.id,
      ad: a.profil.ad,
      kullaniciAdi: a.profil.kullanici_adi,
      avatarYol: a.profil.avatar_yol,
      sonMesaj: son ? son.metin : null,
      sonZaman: son ? son.olusturulma : null,
      okunmamis: okunmamisSayi.get(a.profil.id) ?? 0,
      profil: a.profil,
    }
  })

  // Grup son mesajları: grup başına küçük bir sorgu. Grup sayısı tipik
  // olarak az olduğu için kabul edilebilir.
  const grupSohbetleri: Sohbet[] = await Promise.all(
    gruplar.map(async (g) => {
      let sonMesaj: string | null = null
      let sonZaman: string | null = null
      try {
        const mesajlar = await mesajlariGetir(g.id, 1)
        const son = mesajlar[mesajlar.length - 1]
        if (son) {
          sonMesaj = son.metin
          sonZaman = son.olusturulma
        }
      } catch {
        // Sohbet okunamadıysa grup listede yine görünsün.
      }
      return {
        tur: 'grup' as const,
        id: g.id,
        ad: g.ad,
        kullaniciAdi: null,
        avatarYol: null,
        sonMesaj,
        sonZaman,
        okunmamis: 0,
        grup: g,
      }
    }),
  )

  return [...arkadasSohbetleri, ...grupSohbetleri].sort((a, b) => {
    // Yazışılmış olanlar üstte, kendi aralarında en yeni önce.
    if (a.sonZaman && b.sonZaman) return b.sonZaman.localeCompare(a.sonZaman)
    if (a.sonZaman) return -1
    if (b.sonZaman) return 1
    return a.ad.localeCompare(b.ad, 'tr')
  })
}

// Alt navigasyondaki rozet: okunmamış DM sayısı.
export async function okunmamisMesajSayisi(): Promise<number> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) return 0

  const { count } = await sb()
    .from('direkt_mesajlar')
    .select('id', { count: 'exact', head: true })
    .eq('alan_id', benimId)
    .eq('okundu', false)
  return count ?? 0
}
