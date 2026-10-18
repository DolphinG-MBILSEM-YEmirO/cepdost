/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'
import { kayitEkle } from './db'
import { kayitSiniflandir } from './classify'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

// Required injection point for vite-plugin-pwa's injectManifest strategy.
precacheAndRoute(self.__WB_MANIFEST)

// Every page navigation is served by the cached app shell. Without this,
// URLs with a query (/?shared=ok after an Android share, /share-target/?…
// from the iOS shortcut) went to the network and failed while offline.
// Only GET navigations match, so the POST share handler below is unaffected.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))

const SHARE_TARGET_PATH = '/share-target/'

self.addEventListener('fetch', (event: FetchEvent) => {
  const requestUrl = new URL(event.request.url)
  if (event.request.method === 'POST' && requestUrl.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShare(event))
  }
})

async function handleShare(event: FetchEvent): Promise<Response> {
  try {
    const formData = await event.request.formData()
    const hamBaslik = (formData.get('title') as string) || ''
    const hamMetin = (formData.get('text') as string) || ''
    const hamLink = (formData.get('url') as string) || ''
    const gorseller = formData
      .getAll('images')
      .filter((f): f is File => f instanceof File && f.size > 0)
      .map((f) => ({ name: f.name, type: f.type, blob: f as Blob }))

    const kayit = await kayitEkle({ hamBaslik, hamMetin, hamLink, gorseller })

    // F2 sınıflandırması redirect'i beklemesin — yönlendirme hemen gider,
    // sınıflandırma arka planda biter ve Dexie kaydını günceller. Arşiv
    // ekranı bu güncellemeyi useLiveQuery ile kendiliğinden yakalar.
    // waitUntil, SW yanıtı gönderdikten sonra da bu iş bitene kadar askıya
    // alınmasını engeller.
    event.waitUntil(kayitSiniflandir(kayit))
  } catch (err) {
    // Kayıt oluşturulamadı — arşive yarım/bozuk bir kayıt eklemektense
    // sessizce vazgeçip kullanıcıya genel bir hata bandı gösteriyoruz.
    console.error('share-target: kayıt oluşturulamadı', err)
    return Response.redirect('/?shared=error', 303)
  }

  // 303 turns the POST navigation into a GET, landing the browser on '/'
  // with a flag so the client knows to re-read the store.
  return Response.redirect('/?shared=ok', 303)
}
