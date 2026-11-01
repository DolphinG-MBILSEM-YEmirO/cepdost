// Shrinks an image (object or data URL) into a small JPEG data URL for the
// widget snapshot. Home-screen widgets have tight memory limits (Android
// caps the bitmaps a widget may hold), so photos travel at widget size, not
// full size. Returns null if the image can't be read.
export async function toWidgetImage(url: string, maxSide: number, quality = 0.8): Promise<string | null> {
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}

// The memory photo in the snapshot, and the size it is drawn at.
export const WIDGET_PHOTO_SIDE = 480
