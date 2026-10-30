import { useEffect, useMemo, useRef, useState } from 'react'
import { api, money } from '../lib/api'
import { downloadCsv, num, COMPANY } from '../lib/csv'
import NepaliDateInput, { bsToAd, todayBs, bsFyStart, longBs } from '../components/NepaliDateInput'

/*
  Tally-style horizontal Profit & Loss A/c.
  Left = expenses (Dr), right = incomes (Cr).
  Condensed: one line per group (click a group to open it).
  Expanded: every group open, ledgers listed underneath.
*/

const LABEL = {
  trading_income: 'Sales & direct income',
  trading_expense: 'Purchases & direct expenses',
  income: 'Indirect income',
  expense: 'Indirect expenses',
}

const GREEN = 'var(--primary, #17532f)'

/* ---------- export helpers: libraries load from CDN only when used ---------- */
const scripts = {}
function loadScript(src) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = () => { delete scripts[src]; reject(new Error('Could not load export tool — check internet connection.')) }
      document.head.appendChild(s)
    })
  }
  return scripts[src]
}
const H2C = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'

async function snapshot(node) {
  await loadScript(H2C)
  return window.html2canvas(node, { scale: 2, backgroundColor: '#ffffff', logging: false })
}

function download(href, name) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/* ---------- grouping ---------- */
function groupsOf(rows, section) {
  const map = new Map()
  for (const r of rows) {
    if (r.section !== section) continue
    const g = r.group_name || 'Other'
    if (!map.has(g)) map.set(g, { name: g, total: 0, ledgers: [] })
    const e = map.get(g)
    e.total += Number(r.amount) || 0
    e.ledgers.push({ name: r.ledger_name, amount: Number(r.amount) || 0 })
  }
  return [...map.values()]
}

export default function ProfitLoss() {
  const [from, setFrom] = useState(bsFyStart())
  const [to, setTo] = useState(todayBs())
  const [shown, setShown] = useState({ from: bsFyStart(), to: todayBs() })
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(() => new Set())   // open group keys
  const [view, setView] = useState('condensed')
  const [busy, setBusy] = useState('')
  const report = useRef(null)

  function load() {
    setErr('')
    api.profitLoss(bsToAd(from), bsToAd(to))
      .then((r) => { setRows(r); setShown({ from, to }) })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  const g = useMemo(() => ({
    te: groupsOf(rows, 'trading_expense'),
    ti: groupsOf(rows, 'trading_income'),
    ex: groupsOf(rows, 'expense'),
    inc: groupsOf(rows, 'income'),
  }), [rows])

  const sum = (list) => list.reduce((s, x) => s + x.total, 0)
  const TE = sum(g.te), TI = sum(g.ti), EX = sum(g.ex), INC = sum(g.inc)
  const gross = TI - TE
  const net = gross + INC - EX
  const top = Math.max(TE, TI)
  const bottomL = (gross < 0 ? -gross : 0) + EX + (net >= 0 ? net : 0)
  const bottomR = (gross >= 0 ? gross : 0) + INC + (net < 0 ? -net : 0)

  const allKeys = [...g.te, ...g.ti, ...g.ex, ...g.inc].map((x) => x.name)

  function setMode(m) {
    setView(m)
    setOpen(m === 'expanded' ? new Set(allKeys) : new Set())
  }
  function toggle(key) {
    setOpen((prev) => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }
  // keep "Expanded" showing everything after a reload
  useEffect(() => { if (view === 'expanded') setOpen(new Set(allKeys)) }, [rows])

  /* ---------- exports ---------- */
  const fileBase = `profit-loss_${shown.from}_to_${shown.to}`

  async function run(label, fn) {
    if (busy) return
    setBusy(label); setErr('')
    try { await fn() } catch (e) { setErr(e.message || String(e)) } finally { setBusy('') }
  }

  const saveImage = () => run('image', async () => {
    const c = await snapshot(report.current)
    download(c.toDataURL('image/png'), `${fileBase}.png`)
  })

  const savePdf = () => run('pdf', async () => {
    const c = await snapshot(report.current)
    await loadScript(JSPDF)
    const { jsPDF } = window.jspdf
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W = 277, H = 190, M = 10                         // printable area, margins
    const pagePx = Math.floor(c.width * (H / W))           // canvas height that fits one page
    for (let y = 0, page = 0; y < c.height; y += pagePx, page++) {
      const part = document.createElement('canvas')
      part.width = c.width
      part.height = Math.min(pagePx, c.height - y)
      part.getContext('2d').drawImage(c, 0, y, c.width, part.height, 0, 0, c.width, part.height)
      if (page) pdf.addPage()
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, W, (part.height * W) / c.width)
    }
    pdf.save(`${fileBase}.pdf`)
  })

  // prints only the report (as an image) — avoids the whole-page print freeze
  const printReport = () => run('print', async () => {
    const c = await snapshot(report.current)
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(f)
    const d = f.contentWindow.document
    d.open()
    d.write(`<!doctype html><html><head><title>${fileBase}</title>
      <style>@page{size:A4 landscape;margin:10mm}body{margin:0}img{width:100%}</style></head>
      <body><img src="${c.toDataURL('image/png')}"></body></html>`)
    d.close()
    await new Promise((r) => { const img = d.querySelector('img'); img.complete ? r() : (img.onload = r) })
    f.contentWindow.focus()
    f.contentWindow.print()
    setTimeout(() => f.remove(), 1000)
  })

  function exportCsv() {
    const body = []
    for (const [key, list] of [['trading_income', g.ti], ['trading_expense', g.te]])
      for (const gr of list) for (const l of gr.ledgers) body.push([LABEL[key], gr.name, l.name, num(l.amount)])
    body.push(['', '', gross >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS', num(Math.abs(gross))])
    for (const [key, list] of [['income', g.inc], ['expense', g.ex]])
      for (const gr of list) for (const l of gr.ledgers) body.push([LABEL[key], gr.name, l.name, num(l.amount)])
    body.push(['', '', net >= 0 ? 'NET PROFIT' : 'NET LOSS', num(Math.abs(net))])
    downloadCsv('profit-and-loss', ['Section', 'Group', 'Ledger', 'Amount'], body,
      [COMPANY, 'Profit & Loss Account', `Period: ${shown.from} to ${shown.to} (BS)`])
  }

  /* ---------- rendering ---------- */
  const groupRows = (list) => list.map((gr) => {
    const isOpen = open.has(gr.name)
    return (
      <div key={gr.name}>
        <div style={st.groupRow} onClick={() => toggle(gr.name)} title={isOpen ? 'Click to close' : 'Click to show ledgers'}>
          <span style={st.caret}>{isOpen ? '▾' : '▸'}</span>
          <span style={{ flex: 1, fontWeight: 600 }}>{gr.name}</span>
          <span style={st.amt}>{money(gr.total)}</span>
        </div>
        {isOpen && gr.ledgers.map((l, i) => (
          <div key={i} style={st.ledgerRow}>
            <span style={{ flex: 1 }}>{l.name}</span>
            <span style={st.sub}>{money(l.amount)}</span>
            <span style={st.amt} />
          </div>
        ))}
      </div>
    )
  })

  const line = (label, amount, style) => (
    <div style={{ ...st.groupRow, cursor: 'default', ...style }}>
      <span style={st.caret} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={st.amt}>{money(amount)}</span>
    </div>
  )

  const side = (children, total) => (
    <div style={st.side}>
      <div style={{ flex: 1 }}>{children}</div>
      <div style={st.total}><span>Total</span><span>{money(total)}</span></div>
    </div>
  )

  const profitStyle = { fontStyle: 'italic', fontWeight: 700, color: 'var(--accent, #15803d)' }
  const lossStyle = { fontStyle: 'italic', fontWeight: 700, color: 'var(--cr, #b42318)' }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Profit &amp; Loss Account</h1>
          <p className="sub">{longBs(shown.from)} to {longBs(shown.to)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="small muted" style={{ marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>View</div>
          <div role="tablist" style={st.segWrap}>
            {['condensed', 'expanded'].map((m) => (
              <button key={m} type="button" role="tab" aria-selected={view === m}
                      style={{ ...st.segBtn, ...(view === m ? st.segOn : null) }}
                      onClick={() => setMode(m)}>
                {m === 'condensed' ? 'Condensed' : 'Expanded'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="toolbar">
        <div className="field"><label>From (BS)</label>
          <NepaliDateInput value={from} onChange={setFrom} /></div>
        <div className="field"><label>To (BS)</label>
          <NepaliDateInput value={to} onChange={setTo} /></div>
        <button className="primary" onClick={load}>Show</button>
        <button className="ghost" onClick={savePdf} disabled={!!busy}>{busy === 'pdf' ? 'Preparing…' : 'PDF'}</button>
        <button className="ghost" onClick={saveImage} disabled={!!busy}>{busy === 'image' ? 'Preparing…' : 'Image'}</button>
        <button className="ghost" onClick={printReport} disabled={!!busy}>{busy === 'print' ? 'Preparing…' : 'Print'}</button>
        <button className="ghost" onClick={exportCsv}>CSV</button>
      </div>

      {/* everything inside this box is what PDF / Image / Print capture */}
      <div ref={report} style={st.report}>
        <div style={st.titleBar}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{COMPANY}</div>
          <div style={{ fontWeight: 600 }}>Profit &amp; Loss A/c</div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>
            {longBs(shown.from)} to {longBs(shown.to)}
            <span style={{ color: '#9aa3a0' }}> · {bsToAd(shown.from)} to {bsToAd(shown.to)}</span>
          </div>
        </div>

        <div style={st.headRow}>
          <div style={st.headCell}><span>Particulars</span><span>Amount</span></div>
          <div style={st.headCell}><span>Particulars</span><span>Amount</span></div>
        </div>

        {/* trading part */}
        <div style={st.block}>
          {side(<>
            {groupRows(g.te)}
            {gross >= 0 && line('Gross Profit c/o', gross, profitStyle)}
          </>, top)}
          {side(<>
            {groupRows(g.ti)}
            {gross < 0 && line('Gross Loss c/o', -gross, lossStyle)}
          </>, top)}
        </div>

        {/* profit & loss part */}
        <div style={st.block}>
          {side(<>
            {gross < 0 && line('Gross Loss b/f', -gross, { fontWeight: 600 })}
            {groupRows(g.ex)}
            {net >= 0 && line('Nett Profit', net, profitStyle)}
          </>, bottomL)}
          {side(<>
            {gross >= 0 && line('Gross Profit b/f', gross, { fontWeight: 600 })}
            {groupRows(g.inc)}
            {net < 0 && line('Nett Loss', -net, lossStyle)}
          </>, bottomR)}
        </div>

        {!rows.length && <div style={{ padding: 16, color: '#6b7280' }}>No income or expense entries in this period.</div>}
      </div>
    </>
  )
}

const st = {
  report: {
    background: '#fff', border: '1px solid #cfd8d3', borderRadius: 10, overflow: 'hidden',
    fontVariantNumeric: 'tabular-nums', color: '#111827',
  },
  titleBar: { textAlign: 'center', padding: '14px 12px 10px', borderBottom: '1px solid #cfd8d3', lineHeight: 1.5 },
  headRow: { display: 'flex', flexWrap: 'wrap', background: '#f1f5f2', borderBottom: '1px solid #cfd8d3' },
  headCell: {
    flex: '1 1 340px', display: 'flex', justifyContent: 'space-between', padding: '8px 14px',
    fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.03em', color: '#374151',
  },
  block: { display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #cfd8d3' },
  side: {
    flex: '1 1 340px', display: 'flex', flexDirection: 'column', minWidth: 0,
    borderRight: '1px solid #e5e7eb',
  },
  groupRow: { display: 'flex', alignItems: 'baseline', gap: 6, padding: '7px 14px', cursor: 'pointer' },
  ledgerRow: { display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 14px 3px 38px', fontSize: 14, color: '#374151' },
  caret: { width: 14, color: '#6b7280', fontSize: 12, flex: 'none' },
  amt: { width: 130, textAlign: 'right', flex: 'none' },
  sub: { width: 110, textAlign: 'right', flex: 'none', fontStyle: 'italic', color: '#4b5563' },
  total: {
    display: 'flex', justifyContent: 'space-between', padding: '8px 14px', fontWeight: 700,
    borderTop: '1.5px solid #111827', marginTop: 8,
  },
  segWrap: {
    display: 'inline-flex', padding: 4, gap: 4, borderRadius: 999,
    background: '#eef2ef', border: '1px solid #dfe6e1',
  },
  segBtn: {
    border: 0, background: 'transparent', color: '#4b5563', cursor: 'pointer',
    padding: '8px 18px', borderRadius: 999, fontSize: 15, fontWeight: 500,
  },
  segOn: { background: GREEN, color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)' },
}
