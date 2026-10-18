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

async function gmailIleGonder(posta: Posta): Promise<void> {
  const a = ayarlar()
  if (!a) throw new Error('GMAIL_ADRESI / GMAIL_UYGULAMA_SIFRESI tanımlı değil')
  const tasiyici = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: a.adres, pass: a.sifre },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  })
  await tasiyici.sendMail({
    from: { name: 'CepDost', address: a.adres },
    to: posta.alici,
    subject: posta.konu,
    text: posta.metin,
    html: posta.html,
  })
}

// Swappable so tests can read the mail instead of sending it.
export const postaci = { gonder: gmailIleGonder }
