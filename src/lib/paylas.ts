// Opens the phone's share sheet, or copies the text and link where there
// isn't one (desktop browsers). Tells the caller which happened, so it can
// say "copied" only when it was.
export type PaylasimSonucu = 'paylasildi' | 'kopyalandi' | 'vazgecildi'

export async function paylasVeyaKopyala(veri: { baslik: string; metin: string; url: string }): Promise<PaylasimSonucu> {
  if (navigator.share) {
    try {
      await navigator.share({ title: veri.baslik, text: veri.metin, url: veri.url })
      return 'paylasildi'
    } catch (err) {
      // Closing the sheet is not an error; anything else falls back to copying.
      if (err instanceof DOMException && err.name === 'AbortError') return 'vazgecildi'
    }
  }
  await navigator.clipboard.writeText(`${veri.metin}\n${veri.url}`)
  return 'kopyalandi'
}
