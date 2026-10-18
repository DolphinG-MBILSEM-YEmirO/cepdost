// Sends mail through a Gmail account (free, about 500 messages a day).
//
// Settings (Vercel → Project → Settings → Environment Variables):
//   GMAIL_ADRESI           the account mail is sent from
//   GMAIL_UYGULAMA_SIFRESI a Google "app password" for that account (16
//                          letters, made at myaccount.google.com/apppasswords
//                          once 2-Step Verification is on), not the account's
//                          own password

import nodemailer from 'nodemailer'

export interface Posta {
  alici: string
  konu: string
  metin: string
  html: string
}

function ayarlar(): { adres: string; sifre: string } | null {
  const adres = process.env.GMAIL_ADRESI?.trim()
  // Google shows app passwords in groups of four; the spaces are not part of it.
  const sifre = process.env.GMAIL_UYGULAMA_SIFRESI?.replace(/\s+/g, '')
  return adres && sifre ? { adres, sifre } : null
}

export function postaAyarliMi(): boolean {
  return ayarlar() !== null
}

function tasiyiciKur(a: { adres: string; sifre: string }) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: a.adres, pass: a.sifre },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  })
}

async function gmailIleGonder(posta: Posta): Promise<void> {
  const a = ayarlar()
  if (!a) throw new Error('GMAIL_ADRESI / GMAIL_UYGULAMA_SIFRESI tanımlı değil')
  await tasiyiciKur(a).sendMail({
    from: { name: 'SharOS', address: a.adres },
    to: posta.alici,
    subject: posta.konu,
    text: posta.metin,
    html: posta.html,
  })
}

// Logs in to Gmail without sending anything.
async function gmailGirisiniDene(): Promise<void> {
  const a = ayarlar()
  if (!a) throw new Error('GMAIL_ADRESI / GMAIL_UYGULAMA_SIFRESI tanımlı değil')
  const tasiyici = tasiyiciKur(a)
  try {
    await tasiyici.verify()
  } finally {
    tasiyici.close()
  }
}

// Swappable so tests can read the mail instead of sending it.
export const postaci = { gonder: gmailIleGonder, girisiDene: gmailGirisiniDene }

// Gmail turned the login down: a wrong address or app password, which only
// a change in the settings fixes (unlike a timeout or a refused recipient).
export function girisReddiMi(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'EAUTH'
}

// Whether Gmail takes our login, as this instance last saw it. A rejected
// login is checked again soon, a working one rarely; a check that fails for
// any other reason counts as working, so a slow network never switches
// verification off.
const GIRIS_TAZELIGI_MS = { tamam: 30 * 60_000, red: 2 * 60_000 }
let giris: { tamam: boolean; yenidenBak: number } | null = null

export function girisSonucunuKaydet(tamam: boolean): void {
  giris = { tamam, yenidenBak: Date.now() + (tamam ? GIRIS_TAZELIGI_MS.tamam : GIRIS_TAZELIGI_MS.red) }
}

// Tests start each case from a clean slate.
export function girisDurumunuUnut(): void {
  giris = null
}

export async function postaCalisiyorMu(): Promise<boolean> {
  if (!postaAyarliMi()) return false
  if (giris && Date.now() < giris.yenidenBak) return giris.tamam
  let tamam = true
  try {
    await postaci.girisiDene()
  } catch (err) {
    tamam = !girisReddiMi(err)
    if (!tamam) console.error('[eposta] Gmail girişi reddedildi:', err instanceof Error ? err.message : err)
  }
  girisSonucunuKaydet(tamam)
  return tamam
}
