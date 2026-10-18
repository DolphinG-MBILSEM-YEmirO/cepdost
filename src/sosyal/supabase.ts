import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// F10 sosyal katman (2026-08-07). Bu istemci YALNIZCA arkadaşlık/müsaitlik/
// davet için kullanılıyor — F2 sınıflandırma ve F8 sohbet hâlâ Edge
// Function'lara doğrudan fetch ile gidiyor (bkz. classify.ts, chat.ts),
// oralarda oturum gerekmiyor.
//
// Uygulamanın geri kalanı bu dosyaya BAĞIMLI OLMAMALI: env değişkenleri
// yoksa veya kullanıcı giriş yapmadıysa CepDost yerel modda tam çalışır.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const sosyalAktif = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// Env eksikse null döner ve tüm sosyal UI kendini gizler — çökme yok.
export const supabase: SupabaseClient | null = sosyalAktif
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // OAuth dönüşünde URL'deki token parçasını yakalayıp temizlesin.
        detectSessionInUrl: true,
        storageKey: 'cepdost-oturum',
      },
    })
  : null

// Çağıran taraf sosyalAktif'i kontrol ettikten sonra bunu kullanır; böylece
// her fonksiyonda null kontrolü tekrarlanmıyor.
export function sb(): SupabaseClient {
  if (!supabase) {
    throw new Error('Sosyal özellikler bu kurulumda kapalı (Supabase env eksik).')
  }
  return supabase
}

export interface GirisSaglayicilari {
  google: boolean
  eposta: boolean
}

// signInWithOAuth tam sayfa yönlendirme yapar — sağlayıcı kapalıysa
// kullanıcı Supabase'in ham JSON hatasına düşer ve bizim hata mesajımız
// hiç gösterilemez. O yüzden butonu göstermeden ÖNCE hangi yöntemlerin
// açık olduğunu soruyoruz. Böylece Google dashboard'dan açıldığı anda
// buton kendiliğinden beliriyor, kod değişikliği gerekmiyor.
export async function girisSaglayicilariniGetir(): Promise<GirisSaglayicilari> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { google: false, eposta: false }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { google: false, eposta: true }
    const veri = await res.json()
    return {
      google: Boolean(veri?.external?.google),
      eposta: veri?.external?.email !== false,
    }
  } catch {
    // Ağ hatasında e-postayı açık varsay — kullanıcıyı tamamen kilitlemeyelim.
    return { google: false, eposta: true }
  }
}
