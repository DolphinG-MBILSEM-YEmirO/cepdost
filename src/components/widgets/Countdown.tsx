import { countdownParts } from '../../widgets/widgetData'

// A ticking countdown in boxes: days, hours, minutes (and seconds in the
// last day). Each digit rolls up into place when it changes.

function RollingNumber({ value }: { value: number }) {
  const text = String(value).padStart(2, '0')
  return (
    <span className="inline-flex overflow-hidden tabular-nums">
      {text.split('').map((digit, i) => (
        // The key changes with the digit, so only the changed digit re-animates.
        <span key={`${i}-${digit}`} className="inline-block animate-rakam">
          {digit}
        </span>
      ))}
    </span>
  )
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white/20 backdrop-blur-md ring-1 ring-white/25 px-2.5 py-1.5 min-w-[3.1rem]">
      <span className="text-[1.35rem] leading-7 font-bold text-white">
        <RollingNumber value={value} />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/75">{label}</span>
    </div>
  )
}

export function Countdown({ ms }: { ms: number }) {
  const { days, hours, minutes, seconds } = countdownParts(ms)
  return (
    <div className="flex items-center gap-1.5" role="timer" aria-live="off">
      {days > 0 && <Unit value={days} label="gün" />}
      <Unit value={hours} label="saat" />
      <Unit value={minutes} label="dk" />
      {days === 0 && <Unit value={seconds} label="sn" />}
    </div>
  )
}
