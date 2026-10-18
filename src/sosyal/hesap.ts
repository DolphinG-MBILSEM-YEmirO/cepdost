import { getPublicKey, verifyEvent } from 'nostr-tools/pure'
import { onayGecerliMi, type EpostaOnayi } from '../../shared/epostaOnayi'
import {
  TUR,
  benimProfilVerim,
  benimYedegim,
  hesapKayitlariniTazele,
  motor,
  nesneMi,
  simdiMs,
  yayinKanaliAl,
  yayinProfili,
  yeniAnahtar,
  type BenimProfilVerim,
  type Gizlilik,
} from './cekirdek'
import { epostaImzacisi } from './epostaImzacisi'
import { dEtiketi, dizinKanali, yedekKanali, type Kanal } from './nostr/kanal'
import { sifreyleCoz, sifreyleSifrele, type SifreliYedek } from './nostr/kodlama'
import { BAGLANTI_YOK, OLAY_TURU } from './nostr/motor'
import { RoleHavuzu, ayarliRoleler } from './nostr/role'

// Account lifecycle: first-time setup (name + username), the password
// backup that lets the user sign in elsewhere with username + password,
// and that sign-in itself.

export const SIFRE_MIN = 8
export const KULLANICI_ADI_MIN = 3
export const KULLANICI_ADI_MAKS = 20
const KULLANICI_ADI_DESENI = /^[a-z0-9_](\.?[a-z0-9_])*$/

export function kullaniciAdiHatasi(ad: string): string | null {
  if (ad.length < KULLANICI_ADI_MIN || ad.length > KULLANICI_ADI_MAKS) {
    return `Kullanıcı adı ${KULLANICI_ADI_MIN}-${KULLANICI_ADI_MAKS} karakter olmalı.`
  }
  if (!KULLANICI_ADI_DESENI.test(ad)) {
    return 'Küçük harf, rakam, _ ve nokta kullanabilirsin (nokta başta, sonda ya da art arda olamaz).'
  }
  return null
}

// A username is taken when someone else's live directory entry claims it.
export async function kullaniciAdiAlinmisMi(ad: string): Promise<boolean> {
  const m = motor()
  const kayitlar = await m.kanalSorgula(await dizinKanali('kullanici', ad))
  return kayitlar.some(
    (k) => k.tur === TUR.dizin && k.yazar !== m.benimId && nesneMi(k.veri) && k.veri.pk === k.yazar,
  )
}

export interface HesapBilgisi {
  ad: string
  kullanici_adi: string
  gizlilik: Gizlilik
  // The verified address and the server's attestation for it (see
  // eposta.ts). Required whenever this deployment verifies emails.
  eposta?: string | null
  onay?: EpostaOnayi | null
}

// Publishes the new account: private profile, broadcast channel, public
// profile and directory entries.
export async function hesabiKur(bilgi: HesapBilgisi): Promise<void> {
  const ad = bilgi.ad.trim()
  if (!ad) throw new Error('Adını yaz.')
  const hata = kullaniciAdiHatasi(bilgi.kullanici_adi)
  if (hata) throw new Error(hata)
  const m = motor()
  const imzaci = await epostaImzacisi()
  if (imzaci && !onayGecerliMi(bilgi.onay, m.benimId, imzaci)) throw new Error('Önce e-posta adresini doğrula.')
  if (await kullaniciAdiAlinmisMi(bilgi.kullanici_adi)) throw new Error('Bu kullanıcı adı zaten alınmış.')

  const ben = await m.ben()
  const mevcut = await benimProfilVerim()
  const profil: BenimProfilVerim = {
    ad,
    kullanici_adi: bilgi.kullanici_adi,
    olusturulma: mevcut?.olusturulma || simdiMs(),
    musaitlik_paylas: mevcut?.musaitlik_paylas ?? true,
    gizlilik: bilgi.gizlilik,
    sifre_belirlendi: mevcut?.sifre_belirlendi ?? false,
    avatar: mevcut?.avatar ?? null,
    biyografi: mevcut?.biyografi ?? null,
    renk: mevcut?.renk ?? null,
    emoji: mevcut?.emoji ?? null,
    eposta: bilgi.eposta ?? mevcut?.eposta ?? null,
    onay: bilgi.onay ?? mevcut?.onay ?? null,
  }

  let yayinKaydi = await m.kayit(ben, m.benimId, 'yayin')
  if (!yayinKaydi) yayinKaydi = await m.yayinla(ben, TUR.yayin, 'yayin', { anahtar: yeniAnahtar() })
  await m.yayinla(ben, TUR.profil, 'profil', profil)
  // The rest is also kept current by every sync, so a failure here is
  // repaired later; the account itself already exists.
  try {
    const anahtar = (yayinKaydi.veri as { anahtar: string }).anahtar
    await m.yayinla(await yayinKanaliAl(anahtar, m.benimId), TUR.profil, 'profil', yayinProfili(profil))
    await hesapKayitlariniTazele(m, profil)
  } catch (err) {
    console.warn('hesap kurulumu kısmen tamamlandı', err)
  }
  void m.esitle().catch(() => {})
}

// Encrypts the secret key with the password and publishes it under the
// username. The password never leaves the device.
export async function sifreyiKaydet(sifre: string): Promise<void> {
  if (sifre.length < SIFRE_MIN) throw new Error(`Şifre en az ${SIFRE_MIN} karakter olmalı.`)
  const m = motor()
  const profil = await benimProfilVerim()
  if (!profil?.kullanici_adi) throw new Error('Önce bir kullanıcı adı seç.')

  const yedek = await sifreyleSifrele(sifre, m.gizliAnahtar())
  await m.yayinla(await m.ben(), TUR.yedek, 'yedek', { kullanici_adi: profil.kullanici_adi, yedek })
  const guncel = { ...profil, sifre_belirlendi: true }
  await hesapKayitlariniTazele(m, guncel)
  await m.yayinla(await m.ben(), TUR.profil, 'profil', guncel)
}

// Moves the directory entry and the password backup when the username
// changes (called by profilGuncelle).
export async function kullaniciAdiniTasi(eski: string | null, yeni: string): Promise<void> {
  const m = motor()
  if (eski && eski !== yeni) {
    const eskiDizin = await dizinKanali('kullanici', eski)
    const eskiYedek = await yedekKanali(eski)
    m.kanalKaydet(eskiDizin)
    m.kanalKaydet(eskiYedek)
    await Promise.all([
      m.yayinla(eskiDizin, TUR.dizin, 'dizin', null),
      m.yayinla(eskiYedek, TUR.yedek, 'yedek', null),
    ]).catch(() => {})
  }
  const yedek = await benimYedegim(m)
  if (yedek) await m.yayinla(await m.ben(), TUR.yedek, 'yedek', { ...yedek, kullanici_adi: yeni })
}

// ---------- signing in with username + password ----------

// Reads one record type from a public channel without an account (the
// engine needs a key; signing in is exactly when there isn't one yet).
async function acikKanalOku(kanal: Kanal, anahtar: string, roleler = ayarliRoleler()) {
  const havuz = new RoleHavuzu(roleler)
  try {
    const d = await dEtiketi(kanal, anahtar)
    const { ulasilan, olaylar } = await havuz.sorgula([{ kinds: [OLAY_TURU], '#i': [kanal.konu], '#d': [d] }])
    if (ulasilan === 0) throw new Error(BAGLANTI_YOK)
    const sonuc: Array<{ yazar: string; veri: unknown; zaman: number }> = []
    for (const olay of olaylar) {
      if (!verifyEvent(olay as Parameters<typeof verifyEvent>[0])) continue
      try {
        const zarf = JSON.parse(olay.content) as { t?: unknown; k?: unknown; v?: unknown }
        if (zarf.k !== anahtar) continue
        sonuc.push({ yazar: olay.pubkey, veri: zarf.v, zaman: olay.created_at })
      } catch {
        // Not ours.
      }
    }
    return sonuc
  } finally {
    havuz.kapat()
  }
}

// Returns the secret key behind username + password. Anyone can publish a
// backup under any username, so a candidate only counts when it decrypts
// with the password to the key of the account that published it.
export async function sifreyleGiris(kullaniciAdi: string, sifre: string, roleler?: string[]): Promise<Uint8Array> {
  const ad = kullaniciAdi.trim().replace(/^@/, '').toLowerCase()
  const adaylar = await acikKanalOku(await yedekKanali(ad), 'yedek', roleler)
  const sirali = adaylar
    .filter((a) => nesneMi(a.veri) && a.veri.pk === a.yazar && nesneMi(a.veri.yedek))
    .sort((a, b) => b.zaman - a.zaman)
  for (const aday of sirali) {
    const sk = await sifreyleCoz(sifre, (aday.veri as { yedek: SifreliYedek }).yedek)
    if (sk && getPublicKey(sk) === aday.yazar) return sk
  }
  throw new Error(
    sirali.length === 0
      ? 'Bu kullanıcı adıyla şifreli bir hesap bulunamadı.'
      : 'Kullanıcı adı veya şifre hatalı.',
  )
}
