// Content reports: shared by the app (the report sheet) and api/sikayet.ts,
// which mails each report to the moderators.

export const SIKAYET_NEDENLERI = {
  taciz: 'Taciz veya zorbalık',
  nefret: 'Nefret söylemi veya tehdit',
  cinsel: 'Cinsel veya uygunsuz içerik',
  siddet: 'Şiddet veya tehlikeli davranış',
  spam: 'Spam, dolandırıcılık veya sahte hesap',
  kisisel: 'Kişisel bilgilerimi izinsiz paylaşıyor',
  diger: 'Başka bir sebep',
} as const

export type SikayetNedeni = keyof typeof SIKAYET_NEDENLERI

export type SikayetHedefTuru = 'kisi' | 'mesaj' | 'ani'

export interface Sikayet {
  neden: SikayetNedeni
  aciklama: string
  hedef: {
    tur: SikayetHedefTuru
    // The reported account's public key.
    kisiId: string
    ad?: string | null
    kullaniciAdi?: string | null
    // The message or memory as the reporter sees it (they can read it, the
    // moderators otherwise can't: it is end-to-end encrypted).
    metin?: string | null
    icerikId?: string | null
  }
  bildiren: { id: string; kullaniciAdi?: string | null }
}

export const SIKAYET_SINIRLARI = { aciklama: 1000, metin: 2000, ad: 80 }
