import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { type Kayit, type Kategori, type Oncelik, kayitGuncelle, kayitDurumDegistir, kayitSil, goruntulemeBasligi } from '../db'
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICON_NAME, PRIORITY_LABELS, PRIORITY_COLORS, CATEGORIES, PRIORITIES, formatDate, formatTime, formatDuration, formatRelativeTime, isPast, isUpcoming, mapUrl, toDateString, addDays } from '../lib/format'
import { ConfirmDialog } from './ConfirmDialog'
import { AniEkleModal } from './AniArsivi'
import { kayittanIcsIndir } from '../takvim'
import { useEscapeIleKapat } from '../lib/useEscapeIleKapat'

interface RecordDetailProps {
  kayit: Kayit
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}

export function RecordDetail({ kayit, onClose, onUpdated, onDeleted }: RecordDetailProps) {
  useEscapeIleKapat(onClose)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(goruntulemeBasligi(kayit))
  const [category, setCategory] = useState<Kategori>(kayit.kategori ?? 'not')
  const [eventDate, setEventDate] = useState(kayit.tarih ?? '')
  const [eventTime, setEventTime] = useState(kayit.saat ?? '')
  const [locationName, setLocationName] = useState(kayit.konum ?? '')
  const [priority, setPriority] = useState<Oncelik>(kayit.oncelik)
  const [duration, setDuration] = useState(kayit.sure ? String(kayit.sure) : '')
  const [notes, setNotes] = useState(kayit.ozetNot ?? '')
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [aniAcik, setAniAcik] = useState(false)

  // Refresh the form from the record, but never while the user is editing:
  // any write to the table hands us a new copy of the record (a status
  // toggle, a background classification finishing) and would wipe their
  // unsaved changes.
  useEffect(() => {
    if (editing) return
    setTitle(goruntulemeBasligi(kayit))
    setCategory(kayit.kategori ?? 'not')
    setEventDate(kayit.tarih ?? '')
    setEventTime(kayit.saat ?? '')
    setLocationName(kayit.konum ?? '')
    setPriority(kayit.oncelik)
    setDuration(kayit.sure ? String(kayit.sure) : '')
    setNotes(kayit.ozetNot ?? '')
  }, [kayit, editing])

  // One object URL per image, revoked when the images change or the screen
  // closes; creating them during render leaked one per keystroke.
  const [gorselUrlleri, setGorselUrlleri] = useState<string[]>([])
  useEffect(() => {
    const urller = kayit.gorseller.map((g) => URL.createObjectURL(g.blob))
    setGorselUrlleri(urller)
    return () => urller.forEach((u) => URL.revokeObjectURL(u))
  }, [kayit.gorseller])

  const colors = CATEGORY_COLORS[kayit.kategori ?? 'not']
  const dateLabel = formatDate(kayit.tarih)
  const timeLabel = formatTime(kayit.saat)
  const durLabel = formatDuration(kayit.sure)
  const past = isPast(kayit.tarih)
  const upcoming = isUpcoming(kayit.tarih)
  const mapsLink = mapUrl(kayit)
  const done = kayit.durum === 'yapildi'
  const baslik = goruntulemeBasligi(kayit)

  // "Anı ekle" çağrısı: plan birlikte yapılmış (grup ya da arkadaş), tarihi
  // gelmiş/geçmiş ve daha önce anı eklenmemiş olmalı.
  const aniHedefAdi = kayit.grupAdi ?? kayit.arkadasAdi ?? 'arkadaşın'
  const aniSorulabilir =
    !kayit.aniEklendi && (!!kayit.grupId || !!kayit.arkadasId) && (past || done)

  async function handleSave() {
    setSaving(true)
    try {
      await kayitGuncelle(kayit.id, {
        baslik: title.trim() || baslik,
        kategori: category,
        tarih: eventDate || null,
        saat: eventTime || null,
        konum: locationName.trim() || null,
        oncelik: priority,
        sure: duration ? Number(duration) : null,
        ozetNot: notes.trim() || null,
      })
      setEditing(false)
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    await kayitDurumDegistir(kayit.id, done ? 'bekliyor' : 'yapildi')
    onUpdated()
  }

  async function handleDelete() {
    await kayitSil(kayit.id)
    onDeleted()
  }

  async function handleReschedule(newDate: string) {
    await kayitGuncelle(kayit.id, { tarih: newDate })
    onUpdated()
  }

  return (
    <div className="panel-tam z-50">
      <div className="flex items-center justify-between px-5 pt-[calc(1rem+var(--safe-top))] pb-3">
        <button onClick={onClose} aria-label="Geri" className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform">
          <Icon name="ArrowLeft" className="w-5 h-5 text-ink-500" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleStatus}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 flex items-center gap-1.5
              ${done ? 'bg-teal-100 text-teal-700' : 'bg-cream-50 text-ink-400 border border-ink-100/40'}`}
          >
            <Icon name={done ? 'CheckCircle2' : 'Circle'} className="w-4 h-4" />
            {done ? 'Yapıldı' : 'Bekliyor'}
          </button>
          {editing ? (
            <button
              onClick={handleSave}
              disabled={saving}
              aria-label="Kaydet"
              className="w-10 h-10 rounded-full bg-coral-500 text-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
            >
              <Icon name={saving ? 'Loader2' : 'Save'} className={`w-5 h-5 ${saving ? 'animate-spin' : ''}`} />
            </button>
          ) : (
            <button onClick={() => setEditing(true)} aria-label="Düzenle" className="w-10 h-10 rounded-full bg-ink-50 flex items-center justify-center active:scale-90 transition-transform">
              <Icon name="Pencil" className="w-5 h-5 text-ink-500" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="card p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center`}>
              <Icon name={CATEGORY_ICON_NAME[kayit.kategori ?? 'not']} className={`w-5 h-5 ${colors.text}`} />
            </div>
            <span className={`chip ${colors.bg} ${colors.text}`}>{kayit.kategori ? CATEGORY_LABELS[kayit.kategori] : 'Sınıflandırılmamış'}</span>
            <span className={`chip ${PRIORITY_COLORS[kayit.oncelik].bg} ${PRIORITY_COLORS[kayit.oncelik].text}`}>
              <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[kayit.oncelik].dot}`} />
              {PRIORITY_LABELS[kayit.oncelik]}
            </span>
          </div>

          {editing ? (
            <>
              <FieldLabel>Başlık</FieldLabel>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field mb-4" />

              <FieldLabel>Kategori</FieldLabel>
              <div className="flex flex-wrap gap-2 mb-4">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`chip ${category === cat ? `${CATEGORY_COLORS[cat].bg} ${CATEGORY_COLORS[cat].text} ring-2 ${CATEGORY_COLORS[cat].ring}` : 'bg-cream-100 text-ink-400'}`}
                  >
                    <Icon name={CATEGORY_ICON_NAME[cat]} className="w-4 h-4" />
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <FieldLabel>Tarih</FieldLabel>
                  <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <FieldLabel>Saat</FieldLabel>
                  <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="input-field" />
                </div>
              </div>

              <FieldLabel>Konum</FieldLabel>
              <input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Konum adı" className="input-field mb-4" />

              <FieldLabel>Öncelik</FieldLabel>
              <div className="flex gap-2 mb-4">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`chip flex-1 justify-center ${priority === p ? `${PRIORITY_COLORS[p].bg} ${PRIORITY_COLORS[p].text} ring-2 ring-ink-200` : 'bg-cream-100 text-ink-400'}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p].dot}`} />
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>

              <FieldLabel>Tahmini süre (dakika)</FieldLabel>
              <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="örn. 60" min="0" className="input-field mb-4" />

              <FieldLabel>Notlar</FieldLabel>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ek not, açıklama, ne getireceğini..." className="input-field resize-none" rows={3} />
            </>
          ) : (
            <>
              <h2 className={`font-display text-xl font-bold text-ink-700 leading-snug ${done ? 'line-through opacity-60' : ''}`}>{baslik}</h2>

              {(dateLabel || timeLabel || durLabel || kayit.konum) && (
                <div className="mt-4 pt-4 border-t border-ink-100/40 space-y-3">
                  {(dateLabel || timeLabel) && (
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg ${past && !done ? 'bg-rose-100' : 'bg-coral-100'} flex items-center justify-center`}>
                        <Icon name="Clock" className={`w-4 h-4 ${past && !done ? 'text-rose-500' : 'text-coral-500'}`} />
                      </div>
                      <div>
                        <p className="text-xs text-ink-400">Tarih & Saat</p>
                        <p className={`text-sm font-medium ${past && !done ? 'text-rose-600' : 'text-ink-600'}`}>
                          {dateLabel ?? 'Belirtilmemiş'}
                          {timeLabel ? ` · ${timeLabel}` : ''}
                          {durLabel ? ` · ${durLabel}` : ''}
                          {past && !done && ' · Kaçtı'}
                          {upcoming && !done && kayit.tarih && ' · Yaklaşıyor'}
                        </p>
                      </div>
                    </div>
                  )}
                  {kayit.konum && (
                    <a href={mapsLink ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 active:scale-[0.98] transition-transform">
                      <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                        <Icon name="MapPin" className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-ink-400">Konum</p>
                        <p className="text-sm font-medium text-teal-600 flex items-center gap-1">
                          {kayit.konum}
                          <Icon name="ExternalLink" className="w-3 h-3" />
                        </p>
                      </div>
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {kayit.mekanOnerisi && !editing && (
          <div className="card p-5 mb-4 bg-amber-50/60 border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="AlertCircle" className="w-4 h-4 text-amber-600" />
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Doğrulanmamış bilgi</p>
            </div>
            <p className="text-sm text-amber-800 leading-relaxed">{kayit.mekanOnerisi}</p>
            <p className="text-[11px] text-amber-600/70 mt-1">Gemini'nin kendi bilgisi — gerçek yorumlardan değil, kontrol etmeden güvenme</p>
          </div>
        )}

        {kayit.yakinOneriler && kayit.yakinOneriler.length > 0 && !editing && (
          <div className="card p-5 mb-4">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">O sırada yakında bulunanlar</p>
            <div className="space-y-2">
              {kayit.yakinOneriler.map((o, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-ink-600 font-medium truncate">{o.isim}</span>
                  <span className="text-ink-400 text-xs shrink-0 ml-2">
                    {o.mesafeMetre != null && (o.mesafeMetre < 1000 ? `${o.mesafeMetre} m` : `${(o.mesafeMetre / 1000).toFixed(1)} km`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {kayit.ozetNot && !editing && (
          <div className="card p-5 mb-4">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Notlar</p>
            <p className="text-sm text-ink-500 whitespace-pre-wrap leading-relaxed">{kayit.ozetNot}</p>
          </div>
        )}

        {kayit.hamMetin && (
          <div className="card p-5 mb-4">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">İçerik</p>
            <p className="text-sm text-ink-500 whitespace-pre-wrap leading-relaxed">{kayit.hamMetin}</p>
          </div>
        )}

        {kayit.hamLink && (
          <div className="card p-5 mb-4">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Kaynak</p>
            <a href={kayit.hamLink} target="_blank" rel="noopener noreferrer" className="text-sm text-coral-600 font-medium flex items-center gap-2 break-all active:scale-[0.98] transition-transform">
              <Icon name="LinkIcon" className="w-4 h-4 shrink-0" />
              {kayit.hamLink}
              <Icon name="ExternalLink" className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}

        {kayit.gorseller.length > 0 && (
          <div className="card p-5 mb-4">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-3">Görsel</p>
            <div className="flex flex-wrap gap-2">
              {kayit.gorseller.map((g, i) => (
                gorselUrlleri[i] && (
                  <img key={i} src={gorselUrlleri[i]} alt={g.name} className="w-24 h-24 rounded-xl object-cover" />
                )
              ))}
            </div>
          </div>
        )}

        {!editing && kayit.tarih && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2 px-1">Hızlı ertele</p>
            <div className="flex gap-2">
              <button onClick={() => handleReschedule(toDateString(addDays(new Date(), 1)))} className="chip bg-cream-50 text-ink-500 border border-ink-100/40 active:scale-95">
                <Icon name="Calendar" className="w-4 h-4" />
                Yarın
              </button>
              <button onClick={() => handleReschedule(toDateString(addDays(new Date(), 3)))} className="chip bg-cream-50 text-ink-500 border border-ink-100/40 active:scale-95">
                <Icon name="Calendar" className="w-4 h-4" />
                3 gün
              </button>
              <button onClick={() => handleReschedule(toDateString(addDays(new Date(), 7)))} className="chip bg-cream-50 text-ink-500 border border-ink-100/40 active:scale-95">
                <Icon name="Calendar" className="w-4 h-4" />
                Haftaya
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-1 mb-4">
          <span className="text-xs text-ink-300">
            {kayit.kaynakTipi === 'gorsel' ? 'Görselden' : kayit.kaynakTipi === 'link' ? 'Linkten' : 'Metinden'} · {formatRelativeTime(kayit.olusturulmaTarihi)}
          </span>
        </div>

        {/* Plan bittiyse ortak hafızaya davet: fotoğraf, gidilen kişinin ya
            da grubun arşivine düşer. Tek başına planlarda hedef yok, o yüzden
            yalnızca birlikte yapılan planlarda çıkıyor. */}
        {aniSorulabilir && (
          <div className="card p-4 mb-3 bg-coral-50/70 border-coral-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-coral-100 flex items-center justify-center shrink-0">
                <Icon name="Camera" className="w-5 h-5 text-coral-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-700">Nasıl geçti?</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  Bir fotoğraf ekle, {aniHedefAdi} arşivinde kalsın.
                </p>
                <button
                  onClick={() => setAniAcik(true)}
                  className="mt-3 chip bg-coral-500 text-white"
                >
                  <Icon name="ImageIcon" className="w-4 h-4" />
                  Fotoğraf ekle
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tarayıcıdan telefonun takvimine doğrudan yazan bir API yok;
            standart yol .ics indirip takvim uygulamasında açmak. */}
        {kayit.tarih && (
          <button
            onClick={() => kayittanIcsIndir(kayit)}
            className="w-full bg-sky-50 text-sky-700 font-medium rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2 active:scale-[0.97] transition-all hover:bg-sky-100 mb-3"
          >
            <Icon name="CalendarPlus" className="w-5 h-5" />
            Telefon takvimime ekle
          </button>
        )}

        <button
          onClick={() => setShowDelete(true)}
          className="w-full bg-rose-50 text-rose-600 font-medium rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2 active:scale-[0.97] transition-all hover:bg-rose-100"
        >
          <Icon name="Trash2" className="w-5 h-5" />
          Kaydı sil
        </button>
      </div>

      {showDelete && (
        <ConfirmDialog title="Kaydı sil?" message="Bu kayıt kalıcı olarak silinecek. Geri alınamaz." onConfirm={handleDelete} onCancel={() => setShowDelete(false)} />
      )}

      {aniAcik && (
        <AniEkleModal
          grupId={kayit.grupId}
          arkadasId={kayit.arkadasId}
          hedefAdi={aniHedefAdi}
          baslangicMekan={kayit.konum}
          baslangicTarih={kayit.tarih}
          onClose={() => setAniAcik(false)}
          onEklendi={async () => {
            setAniAcik(false)
            // Aynı plan için tekrar tekrar sorulmasın.
            await kayitGuncelle(kayit.id, { aniEklendi: true })
            onUpdated()
          }}
        />
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">{children}</label>
}
