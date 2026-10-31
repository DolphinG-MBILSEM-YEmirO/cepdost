import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { SLOGAN, UYGULAMA_ADI } from './shared/marka.ts'

// Server-only settings the api/ handlers read from process.env. On Vercel
// they come from the project's environment variables; in dev from .env.
const API_ENV_ANAHTARLARI = [
  'GEMINI_API_KEY',
  'FOURSQUARE_API_KEY',
  'GEMINI_MODEL',
  'EPOSTA_GIZLI',
  'BILDIRIM_GIZLI',
  'GMAIL_ADRESI',
  'GMAIL_UYGULAMA_SIFRESI',
]

function jsonYaz(res: ServerResponse, durum: number, govde: unknown): void {
  res.statusCode = durum
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(govde))
}

// Node request -> Web Request, the shape Vercel hands to api/ handlers. The
// body is buffered: this only ever runs on a developer's machine.
async function webIstegi(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  const headers = new Headers()
  for (const [ad, deger] of Object.entries(req.headers)) {
    // HTTP/2 pseudo-headers (":path") are not valid header names.
    if (deger === undefined || ad.startsWith(':')) continue
    for (const d of Array.isArray(deger) ? deger : [deger]) headers.append(ad, d)
  }

  const method = req.method ?? 'GET'
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers })

  const parcalar: Buffer[] = []
  for await (const parca of req) parcalar.push(parca as Buffer)
  return new Request(url, { method, headers, body: new Uint8Array(Buffer.concat(parcalar)) })
}

async function nodeYanitinaYaz(yanit: Response, res: ServerResponse): Promise<void> {
  res.statusCode = yanit.status
  yanit.headers.forEach((deger, ad) => res.setHeader(ad, deger))
  res.end(Buffer.from(await yanit.arrayBuffer()))
}

async function apiIstegiYanitla(
  server: ViteDevServer,
  ad: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    if (!existsSync(path.join(server.config.root, 'api', `${ad}.ts`))) {
      jsonYaz(res, 404, { error: 'Bulunamadı' })
      return
    }

    // ssrLoadModule transforms on the fly and picks up edits without a
    // restart, the same way the app's own modules hot-reload.
    const modul = await server.ssrLoadModule(`/api/${ad}.ts`)
    const isleyici: unknown = modul[req.method ?? 'GET']
    if (typeof isleyici !== 'function') {
      // Vercel also answers 405 for a method the route does not export.
      jsonYaz(res, 405, { error: 'Method Not Allowed' })
      return
    }

    const yanit = (await isleyici(await webIstegi(req))) as Response
    await nodeYanitinaYaz(yanit, res)
  } catch (err) {
    if (err instanceof Error) server.ssrFixStacktrace(err)
    server.config.logger.error(`[api/${ad}] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
    if (res.headersSent) res.end()
    else jsonYaz(res, 500, { error: 'Sunucu hatası' })
  }
}

// Fills %UYGULAMA_ADI% and %SLOGAN% in index.html from shared/marka.ts.
function markaHtml(): Plugin {
  return {
    name: 'marka-html',
    transformIndexHtml: (html) => html.replaceAll('%UYGULAMA_ADI%', UYGULAMA_ADI).replaceAll('%SLOGAN%', SLOGAN),
  }
}

// Dev-only stand-in for Vercel's api/ routing, so `npm run dev` exercises the
// same handlers that run in production: /api/<name> calls the export named
// after the HTTP method in api/<name>.ts. Files under api/_lib are not
// routes, here or on Vercel (the name pattern excludes "_").
function apiDevSunucusu(): Plugin {
  return {
    name: 'cepdost-api-dev',
    apply: 'serve',
    configResolved(config) {
      // '' prefix: load every key from the .env files, not just VITE_ ones.
      // A value already in the real environment wins.
      const env = loadEnv(config.mode, process.cwd(), '')
      for (const anahtar of API_ENV_ANAHTARLARI) {
        if (env[anahtar] && !process.env[anahtar]) process.env[anahtar] = env[anahtar]
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const yol = (req.url ?? '').split('?')[0]
        if (!yol.startsWith('/api/')) {
          next()
          return
        }
        const eslesme = /^\/api\/([a-z0-9-]+)$/.exec(yol)
        if (!eslesme) {
          jsonYaz(res, 404, { error: 'Bulunamadı' })
          return
        }
        void apiIstegiYanitla(server, eslesme[1], req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  preview: {
    // Spike A only: lets the Cloudflare quick tunnel's random hostname
    // through Vite's host-check so a real Android phone can reach it.
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [
    apiDevSunucusu(),
    markaHtml(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Spike A: served over HTTPS + installed, this is what proves (or
      // disproves) that Android's share sheet can hand data to the app.
      manifest: {
        name: UYGULAMA_ADI,
        short_name: UYGULAMA_ADI,
        description: SLOGAN,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F5F6F8',
        theme_color: '#F5F6F8',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: '/share-target/',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'images', accept: ['image/*'] }],
          },
        },
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
    }),
  ],
})
