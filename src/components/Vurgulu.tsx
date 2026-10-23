import { eslesmeParcalari } from '../lib/arama'

// Text with the parts that match a search marked.
export function Vurgulu({ metin, sorgu }: { metin: string; sorgu: string | null }) {
  if (!sorgu) return <>{metin}</>
  return (
    <>
      {eslesmeParcalari(metin, sorgu).map((p, i) =>
        p.eslesme ? (
          <mark key={i} className="bg-amber-100 text-ink-700 rounded px-0.5">
            {p.metin}
          </mark>
        ) : (
          <span key={i}>{p.metin}</span>
        ),
      )}
    </>
  )
}
