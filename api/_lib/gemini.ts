// Gemini calls shared by chat, classify and ortak-plan.
//
// Provider: Gemini (unlike Anthropic it has a permanent free tier). The key
// lives only in the server environment (GEMINI_API_KEY in Vercel → Project →
// Settings → Environment Variables); the client never sends or sees one.
// That is deliberate: Hallet's "let the user enter their own key" pattern was
// not adopted here.

import { yanit } from './http.js'

const VARSAYILAN_MODEL = 'gemini-3.5-flash-lite'

// Below the routes' maxDuration, so a stuck call ends in our own JSON error
// instead of Vercel killing the function mid-request. The ortak-plan client
// saw Gemini hang for 80+ seconds once in live testing.
const VARSAYILAN_ZAMAN_ASIMI_MS = 25_000

// Read per call rather than at module load: the Vite dev server copies .env
// values into process.env after config resolution, and tests set them late.
export function geminiAnahtari(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null
}

export function anahtarEksikYaniti(): Response {
  // 503, not 500: the code is fine, the deployment is missing configuration.
  return yanit({ error: 'GEMINI_API_KEY tanımlı değil' }, 503)
}

function geminiUrl(): string {
  const model = process.env.GEMINI_MODEL?.trim() || VARSAYILAN_MODEL
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
}

export interface GeminiParcasi {
  text?: string
  functionCall?: { name?: string; args?: Record<string, unknown> }
}

export interface GeminiYaniti {
  candidates?: Array<{ content?: { parts?: GeminiParcasi[] } }>
}

interface CagriSecenekleri {
  // Names the caller in logs, e.g. 'chat'.
  etiket: string
  zamanAsimiMs?: number
}

// POSTs a generateContent request. Returns null on any failure (HTTP error,
// timeout, network error, unparseable body) after logging why; callers map
// null to their own user-facing error. Request contents are never logged,
// since they carry the user's plans and shared items.
export async function geminiCagir(
  anahtar: string,
  govde: unknown,
  { etiket, zamanAsimiMs = VARSAYILAN_ZAMAN_ASIMI_MS }: CagriSecenekleri,
): Promise<GeminiYaniti | null> {
  try {
    const res = await fetch(geminiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': anahtar },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(zamanAsimiMs),
    })
    if (!res.ok) {
      console.error(`Gemini API hatası (${etiket})`, res.status, await res.text().catch(() => ''))
      return null
    }
    return (await res.json()) as GeminiYaniti
  } catch (err) {
    console.error(`Gemini call failed (${etiket})`, err)
    return null
  }
}

export function geminiParcalari(veri: GeminiYaniti): GeminiParcasi[] {
  const parcalar = veri.candidates?.[0]?.content?.parts
  return Array.isArray(parcalar) ? parcalar : []
}
