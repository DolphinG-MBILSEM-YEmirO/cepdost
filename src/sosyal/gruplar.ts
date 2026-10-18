import { sb } from './supabase'
import { PROFIL_ALANLARI, type Gizlilik, type Profil } from './api'

// F11 sosyal katman: gruplar, grup planları, grup sohbeti, anı arşivi.
// F10'daki ilke burada da geçerli — yetkilendirme tamamen RLS'te; bu
// dosyadaki bir hata yetki açığına dönüşemez, sunucu reddeder.

export interface Grup {
  id: string
  ad: string
  olusturan_id: string
  olusturulma: string
}

export interface GrupUyesi {
  kullanici_id: string
  rol: 'yonetici' | 'uye'
  profil: Profil | null
}

export interface GrupPlani {
  id: string
  grup_id: string
  olusturan_id: string
  baslik: string
  tarih: string
  saat: string | null
  sure: number | null
  konum: string | null
  notlar: string | null
  olusturulma: string
}

export type YanitDurumu = 'geliyorum' | 'gelmiyorum' | 'belki'

export interface PlanYaniti {
  plan_id: string
  kullanici_id: string
  durum: YanitDurumu
}

export interface GrupMesaji {
  id: string
  grup_id: string
  gonderen_id: string
  metin: string
  // Doluysa mesaj sohbette bir plan kartı olarak gösterilir. RLS planın
  // aynı gruba ait olmasını şart koşuyor (bkz. private.plan_bu_grupta_mi).
  plan_id: string | null
  olusturulma: string
}

const MESAJ_ALANLARI = 'id, grup_id, gonderen_id, metin, plan_id, olusturulma'

export interface Ani {
  id: string
  sahip_id: string
  grup_id: string | null
  arkadas_id: string | null
  mekan_adi: string
  tarih: string
  notlar: string | null
  dosya_yolu: string | null
  // 'arkadaslar': yalnızca hedef grup/arkadaş görür.
  // 'herkes': giriş yapmış tüm CepDost kullanıcıları (Keşfet akışı).
  gorunurluk: Gizlilik
  olusturulma: string
}

const ANI_ALANLARI =
  'id, sahip_id, grup_id, arkadas_id, mekan_adi, tarih, notlar, dosya_yolu, gorunurluk, olusturulma'

// ---------- gruplar ----------

// Grup kurma tek bir RPC ile: grup + kurucunun yöneticiliği + üyeler
// atomik olarak oluşur (bkz. public.grup_olustur).
export async function grupOlustur(ad: string, uyeIdler: string[]): Promise<string> {
  const { data, error } = await sb().rpc('grup_olustur', { p_ad: ad, p_uyeler: uyeIdler })
  if (error) throw new Error(error.message)
  return data as string
}

export async function gruplarimiGetir(): Promise<Grup[]> {
  const { data, error } = await sb()
    .from('gruplar')
    .select('id, ad, olusturan_id, olusturulma')
    .order('olusturulma', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Grup[]
}

export async function grupUyeleriGetir(grupId: string): Promise<GrupUyesi[]> {
  const { data, error } = await sb()
    .from('grup_uyeleri')
    .select('kullanici_id, rol')
    .eq('grup_id', grupId)
  if (error) throw new Error(error.message)

  const satirlar = (data ?? []) as Array<{ kullanici_id: string; rol: 'yonetici' | 'uye' }>
  if (satirlar.length === 0) return []

  // Üyelerin profilleri ayrı çekiliyor: profiller RLS'i yalnızca kendim +
  // ilişkili kişileri döndürür, yani grup arkadaşım olmayan bir üyenin
  // profili null gelebilir — UI bunu "CepDost kullanıcısı" olarak gösterir.
  const { data: profiller } = await sb()
    .from('profiller')
    .select(PROFIL_ALANLARI)
    .in('id', satirlar.map((s) => s.kullanici_id))

  const harita = new Map<string, Profil>()
  for (const p of (profiller ?? []) as Profil[]) harita.set(p.id, p)

  return satirlar.map((s) => ({
    kullanici_id: s.kullanici_id,
    rol: s.rol,
    profil: harita.get(s.kullanici_id) ?? null,
  }))
}

export async function grubaUyeEkle(grupId: string, kullaniciId: string): Promise<void> {
  const { error } = await sb().rpc('gruba_uye_ekle', {
    p_grup: grupId,
    p_kullanici: kullaniciId,
  })
  if (error) throw new Error(error.message)
}

export async function gruptanAyril(grupId: string, kullaniciId: string): Promise<void> {
  const { error } = await sb()
    .from('grup_uyeleri')
    .delete()
    .eq('grup_id', grupId)
    .eq('kullanici_id', kullaniciId)
  if (error) throw new Error(error.message)
}

// ---------- grup planları ----------

export interface YeniGrupPlani {
  grupId: string
  baslik: string
  tarih: string
  saat?: string | null
  sure?: number | null
  konum?: string | null
  notlar?: string | null
}

// Oluşturulan planın id'sini döner — çağıran taraf kurucuyu hemen
// "geliyorum" işaretleyebilsin diye (bkz. OrtakPlanSihirbazi).
export async function grupPlaniOlustur(plan: YeniGrupPlani): Promise<string> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { data, error } = await sb()
    .from('grup_planlari')
    .insert({
      grup_id: plan.grupId,
      olusturan_id: benimId,
      baslik: plan.baslik,
      tarih: plan.tarih,
      saat: plan.saat || null,
      sure: plan.sure ?? null,
      konum: plan.konum || null,
      notlar: plan.notlar || null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export async function grupPlanlariGetir(grupId: string): Promise<GrupPlani[]> {
  const { data, error } = await sb()
    .from('grup_planlari')
    .select('id, grup_id, olusturan_id, baslik, tarih, saat, sure, konum, notlar, olusturulma')
    .eq('grup_id', grupId)
    .order('tarih', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as GrupPlani[]
}

export async function planYanitlariGetir(planIdler: string[]): Promise<PlanYaniti[]> {
  if (planIdler.length === 0) return []
  const { data, error } = await sb()
    .from('grup_plan_yanitlari')
    .select('plan_id, kullanici_id, durum')
    .in('plan_id', planIdler)
  if (error) throw new Error(error.message)
  return (data ?? []) as PlanYaniti[]
}

export async function planaYanitVer(planId: string, durum: YanitDurumu): Promise<void> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { error } = await sb()
    .from('grup_plan_yanitlari')
    .upsert(
      { plan_id: planId, kullanici_id: benimId, durum, guncelleme: new Date().toISOString() },
      { onConflict: 'plan_id,kullanici_id' },
    )
  if (error) throw new Error(error.message)
}

// ---------- grup sohbeti ----------

export async function mesajlariGetir(grupId: string, limit = 100): Promise<GrupMesaji[]> {
  const { data, error } = await sb()
    .from('grup_mesajlari')
    .select(MESAJ_ALANLARI)
    .eq('grup_id', grupId)
    .order('olusturulma', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  // En yeniden çekip ters çeviriyoruz: limit son mesajlara uygulanmalı,
  // ama ekranda eskiden yeniye sıralı görünmeli.
  return ((data ?? []) as GrupMesaji[]).reverse()
}

// planId verilirse mesaj sohbette plan kartı olarak görünür — "planı grupla
// paylaş" akışı bunu kullanıyor.
export async function mesajGonder(
  grupId: string,
  metin: string,
  planId?: string | null,
): Promise<void> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { error } = await sb().from('grup_mesajlari').insert({
    grup_id: grupId,
    gonderen_id: benimId,
    metin: metin.trim(),
    plan_id: planId ?? null,
  })
  if (error) throw new Error(error.message)
}

// Sohbetteki plan kartlarını çizmek için: id → plan.
export async function planlariIdyeGoreGetir(idler: string[]): Promise<Map<string, GrupPlani>> {
  const harita = new Map<string, GrupPlani>()
  const tekil = Array.from(new Set(idler.filter(Boolean)))
  if (tekil.length === 0) return harita

  const { data } = await sb()
    .from('grup_planlari')
    .select('id, grup_id, olusturan_id, baslik, tarih, saat, sure, konum, notlar, olusturulma')
    .in('id', tekil)
  for (const p of (data ?? []) as GrupPlani[]) harita.set(p.id, p)
  return harita
}

// Realtime abonelik — yeni mesaj geldiğinde callback. Kapatmak için dönen
// fonksiyon çağrılır.
export function mesajlariDinle(grupId: string, geldi: (m: GrupMesaji) => void): () => void {
  const kanal = sb()
    .channel(`grup-mesaj-${grupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'grup_mesajlari', filter: `grup_id=eq.${grupId}` },
      (yuk) => geldi(yuk.new as GrupMesaji),
    )
    .subscribe()

  return () => {
    void sb().removeChannel(kanal)
  }
}

// ---------- anılar (mekan fotoğrafı arşivi) ----------

export interface YeniAni {
  grupId?: string | null
  arkadasId?: string | null
  mekanAdi: string
  tarih: string
  notlar?: string | null
  gorunurluk?: Gizlilik
  dosya: File
}

// Sıra önemli: önce satır, sonra dosya. Storage politikası dosyayı kabul
// etmek için anilar satırının VAR olmasını ve bana ait olmasını şart
// koşuyor — böylece kovaya sahipsiz dosya bırakılamıyor.
export async function aniEkle(yeni: YeniAni): Promise<Ani> {
  const { data: oturum } = await sb().auth.getUser()
  const benimId = oturum.user?.id
  if (!benimId) throw new Error('Oturum bulunamadı')

  const { data: satir, error: satirHata } = await sb()
    .from('anilar')
    .insert({
      sahip_id: benimId,
      grup_id: yeni.grupId ?? null,
      arkadas_id: yeni.arkadasId ?? null,
      mekan_adi: yeni.mekanAdi.trim(),
      tarih: yeni.tarih,
      notlar: yeni.notlar?.trim() || null,
      gorunurluk: yeni.gorunurluk ?? 'arkadaslar',
    })
    .select(ANI_ALANLARI)
    .single()
  if (satirHata) throw new Error(satirHata.message)

  const ani = satir as Ani
  const uzanti = (yeni.dosya.name.split('.').pop() || 'jpg').toLowerCase()
  const yol = `${ani.id}/foto.${uzanti}`

  const { error: yuklemeHata } = await sb()
    .storage.from('anilar')
    .upload(yol, yeni.dosya, { contentType: yeni.dosya.type || 'image/jpeg', upsert: true })

  if (yuklemeHata) {
    // Dosya yüklenemediyse yarım satır bırakma — arşivde boş kart görünmesin.
    await sb().from('anilar').delete().eq('id', ani.id)
    throw new Error(`Fotoğraf yüklenemedi: ${yuklemeHata.message}`)
  }

  const { error: guncelleHata } = await sb()
    .from('anilar')
    .update({ dosya_yolu: yol })
    .eq('id', ani.id)
  if (guncelleHata) throw new Error(guncelleHata.message)

  return { ...ani, dosya_yolu: yol }
}

export async function anilariGetir(secim: {
  grupId?: string | null
  arkadasId?: string | null
}): Promise<Ani[]> {
  let sorgu = sb().from('anilar').select(ANI_ALANLARI).order('tarih', { ascending: false })

  if (secim.grupId) {
    sorgu = sorgu.eq('grup_id', secim.grupId)
  } else if (secim.arkadasId) {
    // İki yönlü: benim onun için eklediğim + onun benim için eklediği.
    sorgu = sorgu.or(`arkadas_id.eq.${secim.arkadasId},sahip_id.eq.${secim.arkadasId}`)
  }

  const { data, error } = await sorgu
  if (error) throw new Error(error.message)
  return (data ?? []) as Ani[]
}

// Akış kapsamı: 'arkadaslar' = yalnızca bana/gruplarıma özel paylaşılanlar
// (RLS zaten yabancıların özel anılarını döndürmüyor), 'herkes' = Keşfet.
export type AkisKapsami = 'arkadaslar' | 'herkes'

export async function akisAnilariGetir(kapsam: AkisKapsami, limit = 60): Promise<Ani[]> {
  const { data, error } = await sb()
    .from('anilar')
    .select(ANI_ALANLARI)
    .eq('gorunurluk', kapsam)
    .not('dosya_yolu', 'is', null)
    .order('olusturulma', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as Ani[]
}

// Keşfet'te fotoğrafın kime ait olduğunu göstermek için. Hesabı kapalı
// olanların profili RLS'ten dönmez — o zaman isim gösterilmez.
export async function profilleriGetir(idler: string[]): Promise<Map<string, Profil>> {
  const harita = new Map<string, Profil>()
  if (idler.length === 0) return harita
  const { data } = await sb().from('profiller').select(PROFIL_ALANLARI).in('id', Array.from(new Set(idler)))
  for (const p of (data ?? []) as Profil[]) harita.set(p.id, p)
  return harita
}

// Kova özel (public değil) — görüntülemek için kısa ömürlü imzalı URL.
export async function aniGorselUrl(dosyaYolu: string, saniye = 3600): Promise<string | null> {
  const { data, error } = await sb().storage.from('anilar').createSignedUrl(dosyaYolu, saniye)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function aniSil(ani: Ani): Promise<void> {
  if (ani.dosya_yolu) {
    await sb().storage.from('anilar').remove([ani.dosya_yolu])
  }
  const { error } = await sb().from('anilar').delete().eq('id', ani.id)
  if (error) throw new Error(error.message)
}
