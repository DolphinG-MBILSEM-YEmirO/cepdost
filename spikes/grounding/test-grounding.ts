// Geçici deneme fonksiyonu — F7 öneri motoru fizibilite testi.
// Gemini'nin Google Search grounding'i ile response_schema'nın aynı
// istekte çalışıp çalışmadığını, ve gerçek bir mekan hakkında anlamlı
// öneri üretip üretemediğini doğruluyor. Kalıcı değil.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const body = await req.json().catch(() => ({}))
  const soru = body.soru || 'Beşiktaş\'ta Şeyhmuz Ocakbaşı adlı restoranda ünlü olan yemekler nelerdir? Yorumlarda ne öneriliyor?'

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: soru }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: {
          type: 'OBJECT',
          properties: {
            oneriler: { type: 'ARRAY', items: { type: 'STRING' } },
            ozet: { type: 'STRING' },
          },
          required: ['oneriler', 'ozet'],
        },
      },
    }),
  })

  const status = res.status
  const data = await res.json()
  return new Response(JSON.stringify({ status, data }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
