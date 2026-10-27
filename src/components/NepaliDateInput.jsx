import { useEffect, useRef, useState } from 'react'
import {
  BS_MONTHS, BS_MONTHS_NP, WEEKDAYS, MIN_BS_YEAR, MAX_BS_YEAR,
  parseBs, fmtBs, bsToAd, adToBs, bsWeekday, daysInBsMonth, todayBs,
  longBs, longAd, isProvisionalBs,
} from '../lib/nepaliDate'

const GREEN = 'var(--primary, #17532f)'

/*
  Nepali (BS) date field.
  - BS is the date you type or pick (calendar opens on click / icon).
  - AD is shown faded inside the box, read-only, and follows the BS date.
  value: 'YYYY-MM-DD' (BS)    onChange(bs, ad)
*/
export default function NepaliDateInput({ value, onChange, required, width = 270, id }) {
  const [text, setText] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [bad, setBad] = useState(false)
  const box = useRef(null)

  useEffect(() => { setText(value || ''); setBad(false) }, [value])

  // close on outside click / Esc
  useEffect(() => {
    if (!open) return
    const click = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key) }
  }, [open])

  function commit(bs) {
    setText(bs); setBad(false)
    onChange(bs, bsToAd(bs))
  }

  function typed(v) {
    setText(v)
    const p = parseBs(v)
    if (p) commit(fmtBs(p.y, p.m, p.d))
  }

  // an invalid entry never sticks: put back the last valid date, so the box
  // always shows exactly the date that will be used
  function blur() {
    if (parseBs(text)) return
    setText(value || '')
    setBad(!value && !!required)
  }

  // AD follows what is typed right now (not the last valid value)
  const typedOk = parseBs(text)
  const ad = typedOk ? bsToAd(text) : ''
  const adLabel = ad ? `AD ${ad}` : text.length >= 8 ? 'invalid date' : ''

  return (
    <div ref={box} style={{ position: 'relative', width }}>
      <input
        id={id}
        value={text}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        required={required}
        onChange={(e) => typed(e.target.value)}
        onBlur={blur}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && open) { e.preventDefault(); setOpen(false) } }}
        aria-invalid={bad || (!!text && !typedOk)}
        title={ad ? `${longBs(text)} = ${longAd(ad)}` : 'Nepali date (BS)'}
        style={{
          width: '100%', paddingRight: 150, boxSizing: 'border-box',
          fontVariantNumeric: 'tabular-nums',
          ...(bad || adLabel === 'invalid date' ? { borderColor: 'var(--cr, #b42318)' } : null),
        }}
      />

      {/* faded, read-only AD date */}
      <span
        aria-label="English date"
        style={{
          position: 'absolute', right: 38, top: '50%', transform: 'translateY(-50%)',
          fontSize: 13, pointerEvents: 'none', whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          color: adLabel === 'invalid date' ? 'var(--cr, #b42318)' : '#9aa3a0',
        }}
      >
        {adLabel}
      </span>

      <button
        type="button"
        aria-label="Open Nepali calendar"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          border: 0, background: 'transparent', cursor: 'pointer', padding: 4,
          color: '#4b5563', lineHeight: 0,
        }}
      >
        <CalendarIcon />
      </button>

      {open && (
        <Calendar
          value={parseBs(value) ? value : todayBs()}
          selected={value}
          onPick={(bs) => { commit(bs); setOpen(false) }}
        />
      )}
    </div>
  )
}

/* ---------- popover calendar ---------- */
function Calendar({ value, selected, onPick }) {
  const start = parseBs(value)
  const [y, setY] = useState(start.y)
  const [m, setM] = useState(start.m)
  const today = todayBs()

  function step(n) {
    let ny = y, nm = m + n
    if (nm < 1) { nm = 12; ny-- }
    if (nm > 12) { nm = 1; ny++ }
    if (ny < MIN_BS_YEAR || ny > MAX_BS_YEAR) return
    setY(ny); setM(nm)
  }

  const first = bsWeekday(fmtBs(y, m, 1))
  const len = daysInBsMonth(y, m)
  const cells = [...Array(first).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)]
  const years = []
  for (let i = MIN_BS_YEAR; i <= MAX_BS_YEAR; i++) years.push(i)

  const adFirst = bsToAd(fmtBs(y, m, 1)), adLast = bsToAd(fmtBs(y, m, len))
  const provisional = isProvisionalBs(fmtBs(y, m, 1))

  return (
    <div role="dialog" aria-label="Nepali calendar" style={cal.pop}>
      <div style={cal.head}>
        <button type="button" style={cal.nav} onClick={() => step(-1)} aria-label="Previous month">‹</button>
        <select value={m} onChange={(e) => setM(+e.target.value)} style={cal.sel}>
          {BS_MONTHS.map((n, i) => <option key={n} value={i + 1}>{n} · {BS_MONTHS_NP[i]}</option>)}
        </select>
        <select value={y} onChange={(e) => setY(+e.target.value)} style={cal.sel}>
          {years.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button type="button" style={cal.nav} onClick={() => step(1)} aria-label="Next month">›</button>
      </div>

      <div style={cal.sub}>{shortAd(adFirst)} – {shortAd(adLast)}</div>

      <div style={cal.grid}>
        {WEEKDAYS.map((w, i) => (
          <div key={w} style={{ ...cal.wd, ...(i === 6 ? { color: 'var(--cr, #b42318)' } : null) }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={'e' + i} />
          const bs = fmtBs(y, m, d)
          const isSel = bs === selected, isToday = bs === today, isSat = i % 7 === 6
          return (
            <button
              type="button" key={bs} onClick={() => onPick(bs)}
              title={longAd(bsToAd(bs))}
              style={{
                ...cal.day,
                ...(isSat ? { color: 'var(--cr, #b42318)' } : null),
                ...(isToday ? cal.today : null),
                ...(isSel ? cal.sel1 : null),
              }}
            >
              <span>{d}</span>
              <span style={{ fontSize: 9, opacity: isSel ? .8 : .45 }}>{+bsToAd(bs).slice(8)}</span>
            </button>
          )
        })}
      </div>

      <div style={cal.foot}>
        <button type="button" style={cal.link} onClick={() => onPick(today)}>Today · {longBs(today)}</button>
        {provisional && <span style={{ fontSize: 11, color: '#b54708' }}>provisional calendar</span>}
      </div>
    </div>
  )
}

const shortAd = (ad) => longAd(ad).replace(/ \(\w+\)$/, '')

/* ---------- table cell: BS date with faded AD underneath ---------- */
export function BsDate({ ad, bs }) {
  const b = bs && parseBs(bs) ? bs : adToBs(ad)
  const a = ad ? String(ad).slice(0, 10) : bsToAd(bs)
  if (!b && !a) return null
  return (
    <span style={{ whiteSpace: 'nowrap' }} title={`${longBs(b)} = ${longAd(a)}`}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{b || a}</span>
      {b && a && <span style={{ display: 'block', fontSize: 11, color: '#9aa3a0' }}>{a}</span>}
    </span>
  )
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

const cal = {
  pop: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: 300,
    background: '#fff', border: '1px solid #dfe6e1', borderRadius: 12, padding: 12,
    boxShadow: '0 10px 30px rgba(16,24,20,.14)',
  },
  head: { display: 'flex', alignItems: 'center', gap: 6 },
  nav: {
    border: '1px solid #dfe6e1', background: '#fff', borderRadius: 8, width: 30, height: 30,
    cursor: 'pointer', fontSize: 18, lineHeight: 1, color: '#374151',
  },
  sel: { flex: 1, minWidth: 0, padding: '5px 6px', fontSize: 14 },
  sub: { textAlign: 'center', fontSize: 12, color: '#9aa3a0', margin: '6px 0 8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
  wd: { textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6b7280', padding: '2px 0 4px' },
  day: {
    border: 0, background: 'transparent', borderRadius: 8, cursor: 'pointer', height: 36,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: '#111827', lineHeight: 1.05,
  },
  today: { boxShadow: `inset 0 0 0 1.5px ${GREEN}` },
  sel1: { background: GREEN, color: '#fff' },
  foot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  link: { border: 0, background: 'transparent', color: GREEN, cursor: 'pointer', fontSize: 13, padding: 0 },
}
