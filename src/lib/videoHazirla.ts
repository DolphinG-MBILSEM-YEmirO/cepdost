import { VIDEO_AZAMI_BAYT } from '../sosyal/foto'

// Short clips for posts. Media travels in small encrypted records on free
// relays, so a clip has to fit in about 1.4 MB: a small, short file is sent
// as it is; anything bigger is re-recorded on the device at a lower size
// and bitrate (canvas + MediaRecorder, in real time, so it takes as long as
// the clip). Every clip also gets a cover frame, which the feed shows as
// the thumbnail and older app versions show instead of the video.

export const VIDEO_AZAMI_SANIYE = 15
// Long edge of a re-recorded clip.
const AZAMI_KENAR = 540
const SES_BIT_HIZI = 48_000

export interface HazirVideo {
  bayt: Uint8Array
  // Base type only ("video/webm"), without codecs.
  tip: string
  // Seconds actually kept.
  sure: number
  kapak: File
}

function videoAc(dosya: Blob): Promise<HTMLVideoElement> {
  return new Promise((coz, red) => {
    const v = document.createElement('video')
    v.preload = 'auto'
    v.playsInline = true
    v.muted = true
    v.src = URL.createObjectURL(dosya)
    v.onloadeddata = () => coz(v)
    v.onerror = () => red(new Error('Video açılamadı.'))
  })
}

function videoKapat(v: HTMLVideoElement) {
  v.pause()
  URL.revokeObjectURL(v.src)
  v.removeAttribute('src')
  v.load()
}

function boyut(v: HTMLVideoElement, azami: number) {
  const olcek = Math.min(1, azami / Math.max(v.videoWidth || azami, v.videoHeight || azami))
  // Encoders want even sizes.
  const cift = (n: number) => Math.max(2, Math.round((n * olcek) / 2) * 2)
  return { en: cift(v.videoWidth || azami), boy: cift(v.videoHeight || azami) }
}

// A JPEG of the frame a little into the clip (the very first is often black).
async function kapakAl(v: HTMLVideoElement): Promise<File> {
  await new Promise<void>((coz) => {
    const hedef = Math.min(0.5, (v.duration || 1) / 4)
    if (Math.abs(v.currentTime - hedef) < 0.01) return coz()
    v.onseeked = () => coz()
    v.currentTime = hedef
  })
  const { en, boy } = boyut(v, 1080)
  const tuval = document.createElement('canvas')
  tuval.width = en
  tuval.height = boy
  tuval.getContext('2d')!.drawImage(v, 0, 0, en, boy)
  const blob = await new Promise<Blob>((coz, red) =>
    tuval.toBlob((b) => (b ? coz(b) : red(new Error('Kapak alınamadı.'))), 'image/jpeg', 0.85),
  )
  return new File([blob], 'kapak.jpg', { type: 'image/jpeg' })
}

function kayitTipi(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const adaylar = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
  return adaylar.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

const tabanTip = (tip: string) => (tip.startsWith('video/mp4') ? 'video/mp4' : 'video/webm')

// Plays the clip into a small canvas and records that, with its sound when
// the browser lets us take it.
async function yenidenKaydet(
  v: HTMLVideoElement,
  sure: number,
  tip: string,
  ilerleme?: (oran: number) => void,
): Promise<Blob> {
  const { en, boy } = boyut(v, AZAMI_KENAR)
  const tuval = document.createElement('canvas')
  tuval.width = en
  tuval.height = boy
  const ctx = tuval.getContext('2d')!
  const akis = tuval.captureStream(30)

  // Sound: routed through Web Audio into the recording, not the speakers.
  let sesBaglami: AudioContext | null = null
  try {
    sesBaglami = new AudioContext()
    const kaynak = sesBaglami.createMediaElementSource(v)
    const hedef = sesBaglami.createMediaStreamDestination()
    kaynak.connect(hedef)
    for (const iz of hedef.stream.getAudioTracks()) akis.addTrack(iz)
    v.muted = false
    await sesBaglami.resume()
  } catch {
    // No sound then; the picture still records.
    v.muted = true
  }

  // Spread the size budget over the clip, leaving room for the container.
  const butce = VIDEO_AZAMI_BAYT * 0.85
  const videoBitHizi = Math.max(250_000, Math.min(1_500_000, (butce * 8) / sure - SES_BIT_HIZI))
  const kaydedici = new MediaRecorder(akis, {
    mimeType: tip,
    videoBitsPerSecond: Math.round(videoBitHizi),
    audioBitsPerSecond: SES_BIT_HIZI,
  })
  const parcalar: Blob[] = []
  kaydedici.ondataavailable = (e) => {
    if (e.data.size > 0) parcalar.push(e.data)
  }

  v.currentTime = 0
  await new Promise<void>((coz) => {
    v.onseeked = () => coz()
  })

  return new Promise<Blob>((coz, red) => {
    let bitti = false
    const bitir = () => {
      if (bitti) return
      bitti = true
      v.pause()
      if (kaydedici.state !== 'inactive') kaydedici.stop()
    }
    kaydedici.onstop = () => {
      void sesBaglami?.close().catch(() => {})
      for (const iz of akis.getTracks()) iz.stop()
      coz(new Blob(parcalar, { type: tip }))
    }
    kaydedici.onerror = () => red(new Error('Video küçültülemedi.'))

    const ciz = () => {
      if (bitti) return
      ctx.drawImage(v, 0, 0, en, boy)
      ilerleme?.(Math.min(1, v.currentTime / sure))
      if (v.currentTime >= sure || v.ended) bitir()
      else requestAnimationFrame(ciz)
    }
    v.onended = bitir
    kaydedici.start(500)
    v.play().then(ciz, () => {
      // Autoplay with sound refused: try again silently.
      v.muted = true
      v.play().then(ciz, () => red(new Error('Video oynatılamadı.')))
    })
  })
}

export async function videoHazirla(dosya: File, ilerleme?: (oran: number) => void): Promise<HazirVideo> {
  if (!dosya.type.startsWith('video/')) throw new Error('Lütfen bir video seç.')
  const v = await videoAc(dosya)
  try {
    const sure = Math.min(VIDEO_AZAMI_SANIYE, Number.isFinite(v.duration) ? v.duration : VIDEO_AZAMI_SANIYE)
    const kapak = await kapakAl(v)

    // Small enough already: keep the original quality.
    const dogrudan = (dosya.type.startsWith('video/mp4') || dosya.type.startsWith('video/webm')) &&
      dosya.size <= VIDEO_AZAMI_BAYT &&
      v.duration <= VIDEO_AZAMI_SANIYE + 0.5
    if (dogrudan) {
      ilerleme?.(1)
      return { bayt: new Uint8Array(await dosya.arrayBuffer()), tip: tabanTip(dosya.type), sure, kapak }
    }

    const tip = kayitTipi()
    if (!tip || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      throw new Error('Bu cihaz videoyu küçültemiyor. 1,4 MB’tan küçük, kısa bir video seç.')
    }
    const blob = await yenidenKaydet(v, sure, tip, ilerleme)
    if (blob.size > VIDEO_AZAMI_BAYT) throw new Error('Video sığdırılamadı. Daha kısa bir video dene.')
    return { bayt: new Uint8Array(await blob.arrayBuffer()), tip: tabanTip(tip), sure, kapak }
  } finally {
    videoKapat(v)
  }
}
