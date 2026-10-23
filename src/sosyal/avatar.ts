import { profilGuncelle } from './api'
import { avatarHazirla } from './foto'

// Profile photo: shrunk to a small square JPEG on the device and stored in
// the profile itself, so friends get it with the profile and no separate
// file storage is needed.

export async function avatarYukle(dosya: File): Promise<string> {
  const avatar = await avatarHazirla(dosya)
  await profilGuncelle({ avatar })
  return avatar
}

export async function avatarSil(): Promise<void> {
  await profilGuncelle({ avatar: null })
}
