import { sb } from './supabase'

// F10 sosyal katman API'si. Yetkilendirmenin tamamı veritabanındaki RLS
// politikalarında — buradaki hiçbir fonksiyon "kim neyi görebilir"e karar
// vermiyor, sadece sorguyu atıyor. Yani bu dosyadaki bir hata gizlilik
// açığına dönüşemez; sunucu zaten reddeder.

export type Gizlilik = 'arkadaslar' | 'herkes'

export interface Profil {
  id: string
  ad: string
  kullanici_adi: string | null
  arkadas_kodu: string
  musaitlik_paylas: boolean
  // 'arkadaslar': profili yalnızca arkadaşlar ve istek gönderilen kişiler
  // görür. 'herkes': giriş yapmış tüm CepDost kullanıcıları görür
  // (çıkış yapmış/anonim ziyaretçi DEĞİL — bkz. F12 migration notu).
  gizlilik: Gizlilik
  // Kod ile doğrulama sonrası şifre belirlendi mi. Şifrenin varlığı
  // istemciden okunamadığı için ayrı bayrak tutuluyor.
  sifre_belirlendi: boolean
  // `avatarlar` kovasındaki dosya yolu (<id>/<zaman>.jpg). Kova özel —
  // göstermek için imzalı URL gerekir, bkz. sosyal/avatar.ts.
  avatar_yol: string | null
}

// Tek yerde tutuluyor: yeni bir profil alanı eklendiğinde tüm sorguların
// güncellenmesi unutulmasın.
export const PROFIL_ALANLARI =
  'id, ad, kullanici_adi, arkadas_kodu, musaitlik_paylas, gizlilik, sifre_belirlendi, avatar_yol'

export interface AramaSonucu {
  id: string
  ad: string
  kullanici_adi: string | null
  arkadas_kodu: string
  avatar_yol: string | null
}

export type ArkadaslikDurumu = 'bekliyor' | 'kabul' | 'red' | 'engel'

export interface Arkadaslik {
  id: string
  isteyen_id: string
  istenen_id: string
  durum: ArkadaslikDurumu
  olusturulma: string
}

// Arkadaş listesi görünümü: karşı tarafın profili + ilişkinin yönü.
export interface Arkadas {
  arkadaslikId: string
  profil: Profil
  durum: ArkadaslikDurumu
  // 'giden': ben istedim, karşı taraf onaylamadı. 'gelen': bana istek geldi.
  yon: 'giden' | 'gelen'
}

export interface MusaitlikBlogu {
  id: string
  kullanici_id: string
  tarih: string
  baslangic: string
  bitis: string
}

export type DavetDurumu = 'bekliyor' | 'kabul' | 'red' | 'iptal'

export interface PlanDaveti {
  id: string
  gonderen_id: string
  alan_id: string
  baslik: string
  tarih: string
  saat: string | null
  sure: number | null
  konum: string | null
  mesaj: string | null
  durum: DavetDurumu
  olusturulma: string
}

// ---------- profil ----------

export async function profilimiGetir(): Promise<Profil | null> {
  const { data: oturum } = await sb().auth.getUser()
  const id = oturum.user?.id
  if (!id) return null

  // Filtre şart: RLS artık ilişkili kişilerin profillerini de döndürüyor
  // (bekleyen istekte adın görünmesi için), yani filtresiz sorgu birden
  // fazla satır getirir.
  const { data, error } = await sb()
    .from('profiller')
    .select(PROFIL_ALANLARI)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Profil | null
}

export async function profilGuncelle(
  degisiklik: Partial<
    Pick<Profil, 'ad' | 'kullanici_adi' | 'musaitlik_paylas' | 'gizlilik' | 'sifre_belirlendi'>
  >,
): Promise<void> {
  const { data: oturum } = await sb().auth.getUser()
  const id = oturum.user?.id
  if (!id) throw new Error('Oturum bulunamadı')

  const { error } = await sb().from('profiller').update(degisiklik).eq('id', id)
  if (error) {
    // Kullanıcı adı benzersizlik ihlali en olası hata — anlaşılır çevir.
    if (error.code === '23505') throw new Error('Bu kullanıcı adı zaten alınmış.')
    if (error.code === '23514') throw new Error('Kullanıcı adı 3-20 karakter olmalı; küçük harf, rakam, _ ve nokta kullanabilirsin.')
    throw new Error(error.message)
  }
}

// Tam eşleşme arama (kod veya @kullanıcı adı). Kısmi arama bilinçli olarak
// yok — bkz. public.profil_ara() fonksiyonundaki not.
export async function profilAra(aranan: string): Promise<AramaSonucu | null> {
  const { data, error } = await sb().rpc('profil_ara', { aranan })
  if (error) throw new Error(error.message)
  const liste = (data ?? []) as AramaSonucu[]
  return liste[0] ?? null
}

// ---------- arkadaşlık ----------

export async function arkadaslikIsteGonder(hedefId: string): Promise<void> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { error } = await sb()
    .from('arkadasliklar')
    .insert({ isteyen_id: benimId, istenen_id: hedefId, durum: 'bekliyor' })

  if (error) {
    if (error.code === '23505') throw new Error('Bu kişiyle zaten bir isteğin var.')
    throw new Error(error.message)
  }
}

export async function arkadaslikYanitla(arkadaslikId: string, kabul: boolean): Promise<void> {
  const { error } = await sb()
    .from('arkadasliklar')
    .update({ durum: kabul ? 'kabul' : 'red', guncelleme: new Date().toISOString() })
    .eq('id', arkadaslikId)
  if (error) throw new Error(error.message)
}

export async function arkadasliktanCik(arkadaslikId: string): Promise<void> {
  const { error } = await sb().from('arkadasliklar').delete().eq('id', arkadaslikId)
  if (error) throw new Error(error.message)
}

// Tüm arkadaşlıklar + karşı tarafın profili. RLS sayesinde sadece kendi
// ilişkilerim dönüyor; profiller de yalnızca kabul edilmiş arkadaşlar için
// okunabildiğinden, bekleyen isteklerde profil null gelebilir — o yüzden
// arama sonucundaki adı da ayrıca saklamak yerine burada zarifçe düşüyoruz.
export async function arkadaslariGetir(): Promise<Arkadas[]> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) return []

  const { data, error } = await sb()
    .from('arkadasliklar')
    .select('id, isteyen_id, istenen_id, durum, olusturulma')
    .order('olusturulma', { ascending: false })
  if (error) throw new Error(error.message)

  const iliskiler = (data ?? []) as Arkadaslik[]
  const karsiIdler = iliskiler.map((i) => (i.isteyen_id === benimId ? i.istenen_id : i.isteyen_id))
  if (karsiIdler.length === 0) return []

  const { data: profiller, error: profilHata } = await sb()
    .from('profiller')
    .select(PROFIL_ALANLARI)
    .in('id', karsiIdler)
  if (profilHata) throw new Error(profilHata.message)

  const profilHaritasi = new Map<string, Profil>()
  for (const p of (profiller ?? []) as Profil[]) profilHaritasi.set(p.id, p)

  return iliskiler.map((i) => {
    const karsiId = i.isteyen_id === benimId ? i.istenen_id : i.isteyen_id
    const profil = profilHaritasi.get(karsiId) ?? {
      id: karsiId,
      // Henüz kabul edilmemiş isteklerde karşı profili okuma yetkimiz yok.
      ad: 'CepDost kullanıcısı',
      kullanici_adi: null,
      arkadas_kodu: '',
      musaitlik_paylas: false,
      gizlilik: 'arkadaslar' as const,
      sifre_belirlendi: false,
      avatar_yol: null,
    }
    return {
      arkadaslikId: i.id,
      profil,
      durum: i.durum,
      yon: i.isteyen_id === benimId ? ('giden' as const) : ('gelen' as const),
    }
  })
}

// ---------- müsaitlik ----------

// Bir arkadaşın belirli tarih aralığındaki DOLU saatleri. Ne yaptığı değil,
// sadece ne zaman meşgul olduğu.
export async function arkadasMusaitligi(
  arkadasId: string,
  baslangicTarih: string,
  bitisTarih: string,
): Promise<MusaitlikBlogu[]> {
  const { data, error } = await sb()
    .from('musaitlik_bloklari')
    .select('id, kullanici_id, tarih, baslangic, bitis')
    .eq('kullanici_id', arkadasId)
    .gte('tarih', baslangicTarih)
    .lte('tarih', bitisTarih)
    .order('tarih')
    .order('baslangic')
  if (error) throw new Error(error.message)
  return (data ?? []) as MusaitlikBlogu[]
}

// ---------- plan daveti ----------

export interface YeniDavet {
  alanId: string
  baslik: string
  tarih: string
  saat?: string | null
  sure?: number | null
  konum?: string | null
  mesaj?: string | null
}

// Davetin id'sini döner — çağıran taraf bunu sohbete plan kartı olarak
// düşürebilsin diye (bkz. sosyal/mesajlar.ts direktMesajGonder).
export async function davetGonder(davet: YeniDavet): Promise<string> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { data, error } = await sb()
    .from('plan_davetleri')
    .insert({
      gonderen_id: benimId,
      alan_id: davet.alanId,
      baslik: davet.baslik,
      tarih: davet.tarih,
      saat: davet.saat || null,
      sure: davet.sure ?? null,
      konum: davet.konum || null,
      mesaj: davet.mesaj || null,
      durum: 'bekliyor',
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '42501') throw new Error('Bu kişiye davet gönderemezsin — önce arkadaş olmanız gerekiyor.')
    throw new Error(error.message)
  }
  return (data as { id: string }).id
}

// Sohbetteki davet kartlarını çizmek için: id → davet.
export async function davetleriIdyeGoreGetir(idler: string[]): Promise<Map<string, PlanDaveti>> {
  const harita = new Map<string, PlanDaveti>()
  const tekil = Array.from(new Set(idler.filter(Boolean)))
  if (tekil.length === 0) return harita

  const { data } = await sb()
    .from('plan_davetleri')
    .select('id, gonderen_id, alan_id, baslik, tarih, saat, sure, konum, mesaj, durum, olusturulma')
    .in('id', tekil)
  for (const d of (data ?? []) as PlanDaveti[]) harita.set(d.id, d)
  return harita
}

export async function davetleriGetir(): Promise<{ gelen: PlanDaveti[]; giden: PlanDaveti[] }> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) return { gelen: [], giden: [] }

  const { data, error } = await sb()
    .from('plan_davetleri')
    .select('id, gonderen_id, alan_id, baslik, tarih, saat, sure, konum, mesaj, durum, olusturulma')
    .order('olusturulma', { ascending: false })
  if (error) throw new Error(error.message)

  const hepsi = (data ?? []) as PlanDaveti[]
  return {
    gelen: hepsi.filter((d) => d.alan_id === benimId),
    giden: hepsi.filter((d) => d.gonderen_id === benimId),
  }
}

// Alt navigasyondaki rozet için: bana gelen bekleyen arkadaşlık isteği +
// plan daveti sayısı. Sekmeye girmeden haberdar olunsun diye ayrı ve ucuz
// bir sorgu (sadece sayım, satır çekmiyor).
export async function bekleyenSayisi(): Promise<number> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) return 0

  const [istekler, davetler] = await Promise.all([
    sb()
      .from('arkadasliklar')
      .select('id', { count: 'exact', head: true })
      .eq('istenen_id', benimId)
      .eq('durum', 'bekliyor'),
    sb()
      .from('plan_davetleri')
      .select('id', { count: 'exact', head: true })
      .eq('alan_id', benimId)
      .eq('durum', 'bekliyor'),
  ])

  return (istekler.count ?? 0) + (davetler.count ?? 0)
}

export async function davetYanitla(davetId: string, kabul: boolean): Promise<void> {
  const { error } = await sb()
    .from('plan_davetleri')
    .update({ durum: kabul ? 'kabul' : 'red', guncelleme: new Date().toISOString() })
    .eq('id', davetId)
  if (error) throw new Error(error.message)
}
