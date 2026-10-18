// The SharOS assistant: chats about the user's saved plans and, from a
// single message, prepares a whole plan: what, when, where and with whom.
// Uses the same Gemini provider as classify (see api/_lib/gemini.ts).
//
// Instead of ALL records the client sends a compact text summary it builds
// itself (planOzeti), plus its friends and groups under short handles with
// only their busy time ranges (see api/_lib/asistanPlani.ts).
//
// The model works with two tools in a short loop inside this one request:
// musaitlik_bul returns the slots when everyone is free (computed by code),
// plan_kur hands back the finished plan. The plan is ONLY a suggestion:
// nothing is written or sent here, and no record, invite or group plan
// exists until the user taps the card on the client (see ChatPanel).

import { anahtarEksikYaniti, geminiAnahtari, geminiCagir, geminiParcalari, type GeminiParcasi } from './_lib/gemini.js'
import { jsonGovdeOku, kaynakReddi, metinAl, yanit } from './_lib/http.js'
import {
  MUSAITLIK_FONKSIYONU,
  PLAN_KUR_FONKSIYONU,
  baglamMetni,
  baglamiOku,
  gunAdi,
  musaitlikBul,
  musaitlikUfku,
  planiDogrula,
  takvimTablosu,
  type AsistanBaglami,
  type AsistanPlani,
  type Zaman,
} from './_lib/asistanPlani.js'

// Up to three model calls in a row (look up free slots, maybe again, then
// the plan), each with its own timeout.
export const config = { maxDuration: 60 }

// 20 messages of 2,000 characters, a 6,000 character summary, and the busy
// ranges of the user's friends and group members for three weeks.
const AZAMI_ISTEK = 512 * 1024

// Model calls per request: free slots at most twice, then the plan.
const AZAMI_TUR = 3
// Leaves room under maxDuration for our own error answer.
const SURE_BUTCESI_MS = 55_000

interface SohbetMesaji {
  rol: 'kullanici' | 'asistan'
  metin: string
}

function sistemPrompt(planOzeti: string, z: Zaman, b: AsistanBaglami): string {
  return `Sen SharOS uygulamasının içinde yaşayan, dostane ve kısa konuşan planlama asistanısın. Kullanıcı (${b.benimAdim}) Türkiye'de yaşayan genç bir yetişkin.

Bugün: ${z.bugun} ${gunAdi(z.bugun)}${z.simdiSaat ? `, saat ${z.simdiSaat}` : ''}
Önümüzdeki günler (göreli tarihleri SADECE bu tablodan çöz):
${takvimTablosu(z.bugun)}

Arkadaşları ve grupları (plan kurarken bu kısa kodları kullan):
${baglamMetni(b)}
Dolu saatler ${musaitlikUfku(b, z)} tarihine kadar biliniyor; daha ilerisi için kimsenin müsait olduğunu söyleme.

Kullanıcının kayıtlı planları:
${planOzeti || '(Henüz kayıtlı planı yok.)'}

Görevlerin:
1. Planlar hakkındaki soruları yanıtla: bugün/bu hafta ne var, çakışma var mı, neye öncelik vermeli. SADECE listedeki bilgilere dayan, tarih/mekan/detay uydurma.
2. Kullanıcı bir plan kurmak, eklemek ya da ayarlamak istediğinde BÜTÜN PLANI TEK SEFERDE hazırla ve plan_kur'u çağır:
   - Kimle: isimleri yukarıdaki listeyle eşleştir; Türkçe ekleri ve küçük harfi tanı ("ayşeyle", "Ayşe'ye", "Can'la"). Bir grup adı geçiyorsa (ya da "ekip", "grup" diyip tek bir grup varsa) grubu seç. Listede olmayan birini ASLA ekleme; eşleşmeyen ismi yanıtında söyle.
   - Ne zaman: "cumartesi" tablodaki ilk Cumartesi, "hafta sonu" ilk Cumartesi-Pazar, "haftaya" 7 gün sonrası. Sabah 09:00-12:00, öğle 12:00-14:00, öğleden sonra 14:00-18:00, akşam 18:00-22:00, gece 21:00-23:00.
   - Başkalarıyla planda saat verilmemişse ÖNCE musaitlik_bul ile herkesin boş olduğu aralıkları al, saati o aralıklardan seç. Kullanıcı saati kendisi verdiyse o saati kullan; uygunluğu sistem kontrol edip kullanıcıya gösterir.
   - Tek başına planda saat verilmemişse, saat önemliyse musaitlik_bul'u kişisiz çağırıp kullanıcının boş zamanından seç; saat önemsiz bir hatırlatmaysa saati boş bırak.
   - Bütün günü kaplayan planlarda (kamp, gezi, festival, taşınma, düğün) tum_gun=true yap; saat ve süreyi boş bırak, musaitlik_bul çağırma.
   - Süre verilmemişse makul seç: kahve 60-90, kahvaltı/yemek 90-120, sinema 150, spor 60-90, konser 180, ders/çalışma 60-120 dakika.
   - Kısa bir başlık (kişi/grup adı olmadan), uygun bir emoji, kategori ve öncelik seç. Konumu yalnızca kullanıcı söylediyse yaz.
   - Küçük eksikler için soru sorma: makul varsayılanı seç ve yanıtında kısaca belirt. Yalnızca ne yapılacağı da kimle/ne zaman olduğu da hiç belli değilse tek kısa soru sor.
   - plan_kur bir ÖNERİDİR: kullanıcı karttaki düğmeye basınca plan takvimine eklenir, davetler ya da grup planı o zaman gider. "Kurdum, gönderdim" deme; "Hazırladım, uygunsa dokunman yeterli" havasında konuş.
3. Türkçe, kısa ve sıcak yanıt ver. Plan hazırladığında 1-2 cümleyle neyi neden seçtiğini söyle (ör. "Herkes cumartesi 11:00'de boş görünüyor").`
}

// Caps a long history and abuse: the last 20 messages, each of a sane length.
// Entries that are not objects are dropped rather than crashing the route.
function mesajlariSinirla(ham: unknown): SohbetMesaji[] {
  const mesajlar = Array.isArray(ham) ? ham : []
  return mesajlar
    .slice(-20)
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m) => ({
      rol: m.rol === 'kullanici' ? ('kullanici' as const) : ('asistan' as const),
      metin: String(m.metin ?? '').slice(0, 2000),
    }))
}

interface SohbetSonucu {
  yanit: string | null
  planOnerisi: AsistanPlani | null
}

// Runs the model with the two tools: free-slot lookups are answered here
// and fed back until it hands over a plan or just answers. Returns null when
// Gemini fails.
async function sohbetEt(
  anahtar: string,
  sistem: string,
  gecmis: Array<{ role: string; parts: unknown[] }>,
  b: AsistanBaglami,
  z: Zaman,
): Promise<SohbetSonucu | null> {
  const baslangic = Date.now()
  const contents = [...gecmis]
  let sonMetin: string | null = null

  for (let tur = 1; tur <= AZAMI_TUR; tur++) {
    const kalan = SURE_BUTCESI_MS - (Date.now() - baslangic)
    if (kalan < 5_000) break
    // On the last turn only the plan tool is left, so the loop always ends.
    const sonTur = tur === AZAMI_TUR
    const veri = await geminiCagir(
      anahtar,
      {
        systemInstruction: { parts: [{ text: sistem }] },
        contents,
        tools: [{ functionDeclarations: sonTur ? [PLAN_KUR_FONKSIYONU] : [MUSAITLIK_FONKSIYONU, PLAN_KUR_FONKSIYONU] }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { maxOutputTokens: 800 },
      },
      { etiket: 'chat', zamanAsimiMs: Math.min(25_000, kalan - 2_000) },
    )
    if (!veri) return tur === 1 ? null : { yanit: sonMetin, planOnerisi: null }

    const parcalar = geminiParcalari(veri)
    const metin = parcalar.find((p) => typeof p.text === 'string' && p.text.trim())?.text?.trim() ?? null
    if (metin) sonMetin = metin

    const planCagrisi = parcalar.find((p) => p.functionCall?.name === 'plan_kur')?.functionCall
    if (planCagrisi) {
      return { yanit: metin, planOnerisi: planiDogrula(planCagrisi.args ?? {}, b, z) }
    }

    const aramalar = parcalar.filter((p) => p.functionCall?.name === 'musaitlik_bul')
    if (aramalar.length === 0 || sonTur) return { yanit: sonMetin, planOnerisi: null }

    // The model's turn goes back exactly as it came (Gemini needs its
    // thought signatures), followed by one answer per lookup.
    contents.push({ role: 'model', parts: parcalar })
    contents.push({
      role: 'user',
      parts: aramalar.map((p: GeminiParcasi) => ({
        functionResponse: { name: 'musaitlik_bul', response: musaitlikBul(p.functionCall?.args ?? {}, b, z) },
      })),
    })
  }
  return { yanit: sonMetin, planOnerisi: null }
}

export async function POST(request: Request): Promise<Response> {
  const red = kaynakReddi(request)
  if (red) return red

  const anahtar = geminiAnahtari()
  if (!anahtar) return anahtarEksikYaniti()

  const govde = await jsonGovdeOku(request, AZAMI_ISTEK)
  if (!govde.ok) return govde.yanit
  const girdi = govde.girdi

  const sinirliMesajlar = mesajlariSinirla(girdi.mesajlar)
  if (sinirliMesajlar.length === 0) return yanit({ error: 'boş mesaj listesi' }, 400)

  // The client's local date and time: the function runs in UTC, which lags
  // Turkey by three hours around midnight.
  const bugunHam = metinAl(girdi.bugun)
  const simdiHam = metinAl(girdi.simdiSaat)
  const zaman: Zaman = {
    bugun: /^\d{4}-\d{2}-\d{2}$/.test(bugunHam) ? bugunHam : new Date().toISOString().slice(0, 10),
    simdiSaat: /^\d{2}:\d{2}$/.test(simdiHam) ? simdiHam : '',
  }
  const planOzeti = String(girdi.planOzeti ?? '').slice(0, 6000)
  const baglam = baglamiOku(girdi.baglam)

  const contents = sinirliMesajlar.map((m) => ({
    role: m.rol === 'kullanici' ? 'user' : 'model',
    parts: [{ text: m.metin }],
  }))

  const sonuc = await sohbetEt(anahtar, sistemPrompt(planOzeti, zaman, baglam), contents, baglam, zaman)
  if (!sonuc) return yanit({ error: 'sohbet başarısız' }, 502)
  if (!sonuc.yanit && !sonuc.planOnerisi) return yanit({ error: 'yanıt üretilemedi' }, 502)

  return yanit(sonuc)
}
