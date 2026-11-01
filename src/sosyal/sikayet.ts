import type { Sikayet, SikayetNedeni } from '../../shared/sikayet'
import { benimProfilVerim, motor } from './cekirdek'

// Sends a report to the moderators (api/sikayet.ts). The reported message
// or memory is end-to-end encrypted, so the reporter's copy of its text
// goes with the report.
export async function sikayetGonder(
  hedef: Sikayet['hedef'],
  neden: SikayetNedeni,
  aciklama: string,
): Promise<void> {
  const m = motor()
  const profil = await benimProfilVerim()
  const govde: Sikayet = {
    neden,
    aciklama: aciklama.trim(),
    hedef,
    bildiren: { id: m.benimId, kullaniciAdi: profil?.kullanici_adi ?? null },
  }
  let cevap: Response
  try {
    cevap = await fetch('/api/sikayet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
    })
  } catch {
    throw new Error('Şikâyet gönderilemedi. İnternet bağlantını kontrol et.')
  }
  if (!cevap.ok) {
    const veri = (await cevap.json().catch(() => null)) as { error?: string } | null
    throw new Error(veri?.error ?? 'Şikâyet gönderilemedi. Biraz sonra tekrar dene.')
  }
}
