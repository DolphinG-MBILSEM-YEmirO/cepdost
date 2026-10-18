// Request/response plumbing shared by the API routes (api/*.ts).
//
// The client always calls these routes same-origin (/api/...), so there are
// no CORS headers: a browser on another site gets no readable response, and
// the origin check below stops it from triggering the work at all.

const JSON_BASLIKLARI = {
  'Content-Type': 'application/json; charset=utf-8',
  // Answers are per-request (model output, a private calendar); no cache
  // between the client and the function may keep them.
  'Cache-Control': 'no-store',
}

export function yanit(govde: unknown, durum = 200): Response {
  return new Response(JSON.stringify(govde), { status: durum, headers: JSON_BASLIKLARI })
}

// The host the request was addressed to. Vercel and the Vite dev server both
// pass the Host header through; request.url is the fallback.
function istekHostu(request: Request): string {
  return (request.headers.get('host') ?? new URL(request.url).host).toLowerCase()
}

// Rejects cross-site browser calls: these routes spend our Gemini quota and
// fetch URLs on the caller's behalf, so another site must not be able to
// drive them from its visitors' browsers. Browsers always send Origin on a
// cross-origin POST; a request without one (curl, some same-origin fetches)
// is allowed, since non-browser clients can forge any header anyway.
// Returns the 403 response to send, or null when the request may proceed.
export function kaynakReddi(request: Request): Response | null {
  const origin = request.headers.get('origin')
  if (origin === null) return null

  let kaynak: URL
  try {
    // "null" (sandboxed iframes, file://) fails to parse and is rejected.
    kaynak = new URL(origin)
  } catch {
    return yanit({ error: 'İzin verilmeyen kaynak.' }, 403)
  }

  // Run the Host header through URL with the origin's scheme, so an explicit
  // default port ("example.com:443") compares equal to the bare host.
  let host: string
  try {
    host = new URL(`${kaynak.protocol}//${istekHostu(request)}`).host
  } catch {
    return yanit({ error: 'İzin verilmeyen kaynak.' }, 403)
  }

  return kaynak.host === host ? null : yanit({ error: 'İzin verilmeyen kaynak.' }, 403)
}

// Reads a body stream up to `azamiBayt` bytes. With 'reddet' a longer body
// gives null (the caller answers 413); with 'kes' the first `azamiBayt` bytes
// come back and the rest is never downloaded. Streaming instead of
// request.text() means an oversized body is never held in memory in full.
export async function akisiOku(
  akis: ReadableStream<Uint8Array> | null,
  azamiBayt: number,
  asimda: 'reddet' | 'kes' = 'reddet',
): Promise<Uint8Array | null> {
  if (!akis) return new Uint8Array(0)

  const okuyucu = akis.getReader()
  const parcalar: Uint8Array[] = []
  let toplam = 0
  try {
    for (;;) {
      const { done, value } = await okuyucu.read()
      if (done) break
      if (toplam + value.byteLength > azamiBayt) {
        await okuyucu.cancel()
        if (asimda === 'reddet') return null
        parcalar.push(value.subarray(0, azamiBayt - toplam))
        toplam = azamiBayt
        break
      }
      parcalar.push(value)
      toplam += value.byteLength
    }
  } finally {
    okuyucu.releaseLock()
  }

  const sonuc = new Uint8Array(toplam)
  let konum = 0
  for (const parca of parcalar) {
    sonuc.set(parca, konum)
    konum += parca.byteLength
  }
  return sonuc
}

export type GovdeSonucu =
  | { ok: true; girdi: Record<string, unknown> }
  | { ok: false; yanit: Response }

// Parses a JSON object body of at most `azamiBayt` bytes. Anything that is
// not a JSON object (an array, null, a bare string) is rejected here, so
// handlers can read fields without guarding against a non-object body.
export async function jsonGovdeOku(request: Request, azamiBayt: number): Promise<GovdeSonucu> {
  const cokBuyuk: GovdeSonucu = { ok: false, yanit: yanit({ error: 'İstek gövdesi çok büyük.' }, 413) }
  const gecersiz: GovdeSonucu = { ok: false, yanit: yanit({ error: 'geçersiz JSON gövdesi' }, 400) }

  // Cheap early exit; the streamed read below enforces the limit either way,
  // since Content-Length can be missing (chunked upload) or wrong.
  const bildirilen = Number(request.headers.get('content-length') ?? '0')
  if (bildirilen > azamiBayt) return cokBuyuk

  const bayt = await akisiOku(request.body, azamiBayt)
  if (!bayt) return cokBuyuk

  let girdi: unknown
  try {
    girdi = JSON.parse(new TextDecoder().decode(bayt))
  } catch {
    return gecersiz
  }
  if (typeof girdi !== 'object' || girdi === null || Array.isArray(girdi)) return gecersiz
  return { ok: true, girdi: girdi as Record<string, unknown> }
}

// Field readers for untrusted JSON: a wrong type reads as "missing" instead
// of crashing the handler further down.
export function metinAl(deger: unknown): string {
  return typeof deger === 'string' ? deger : ''
}

export function sayiAl(deger: unknown): number | null {
  return typeof deger === 'number' && Number.isFinite(deger) ? deger : null
}
