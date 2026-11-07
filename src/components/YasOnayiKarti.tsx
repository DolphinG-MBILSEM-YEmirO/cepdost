import { useState } from 'react'
import { Icon } from './Icon'
import { yetiskinOnayiniKaydet, yetiskinOnayiVarMi } from '../lib/yakin'

// Places built around alcohol, hookah or tobacco show in "Yakınında" only
// after the person says they are 18 or older (shared/yakinMekanlar.ts).
// Kept on this device; nothing is sent anywhere.
export function YasOnayiKarti() {
  const [acik, setAcik] = useState(yetiskinOnayiVarMi)

  function degistir(yeni: boolean) {
    yetiskinOnayiniKaydet(yeni)
    setAcik(yeni)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-bolum-soluk text-bolum-koyu flex items-center justify-center">
          <Icon name="ShieldCheck" className="w-5 h-5" />
        </div>
        <h2 className="font-semibold text-ink-700">18+ mekanlar</h2>
      </div>
      <label className="flex items-start justify-between gap-4">
        <span className="text-sm text-ink-500">
          18 yaşından büyüğüm. Yakınında'da bar, meyhane ve nargile gibi mekanlar da gösterilsin.
          <span className="block text-xs text-ink-400 mt-1">Bu seçim yalnızca bu cihazda tutulur. 18 yaşından küçüklere bu mekanlar gösterilmez.</span>
        </span>
        <input
          type="checkbox"
          checked={acik}
          onChange={(e) => degistir(e.target.checked)}
          className="w-5 h-5 mt-0.5 shrink-0 accent-[var(--bolum,#6d28d9)]"
          aria-label="18 yaşından büyüğüm"
        />
      </label>
    </div>
  )
}
