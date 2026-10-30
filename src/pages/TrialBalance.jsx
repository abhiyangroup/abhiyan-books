import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money, drcr } from '../lib/api'
import { downloadCsv, num, COMPANY } from '../lib/csv'
import NepaliDateInput, { bsToAd, todayBs, bsFyStart, longBs } from '../components/NepaliDateInput'

/*
  Tally-style Trial Balance.
  Condensed: one line per primary group (Capital Account, Current Assets…).
  Click a group to open it; Expanded opens every group down to ledgers.
*/

const GREEN = 'var(--primary, #17532f)'

// Tally order of primary groups; anything else follows in the order it appears
const ORDER = [
  'capital account', 'loans (liability)', 'current liabilities', 'suspense a/c', 'branch / divisions',
  'fixed assets', 'investments', 'current assets', 'misc. expenses (asset)',
  'sales accounts', 'purchase accounts', 'direct incomes', 'direct expenses',
  'indirect incomes', 'indirect expenses',
]
const rank = (name) => {
  const i = ORDER.indexOf(String(name).toLowerCase())
  return i < 0 ? 999 : i
}

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
  a.href = href; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
}
async function toPdf(node, name, landscape) {
  const c = await snapshot(node)
  await loadScript(JSPDF)
  const { jsPDF } = window.jspdf
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const M = 10, W = (landscape ? 297 : 210) - 2 * M, H = (landscape ? 210 : 297) - 2 * M
  const pagePx = Math.floor(c.width * (H / W))
  for (let y = 0, page = 0; y < c.height; y += pagePx, page++) {
    const part = document.createElement('canvas')
    part.width = c.width
    part.height = Math.min(pagePx, c.height - y)
    part.getContext('2d').drawImage(c, 0, y, c.width, part.height, 0, 0, c.width, part.height)
    if (page) pdf.addPage()
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, W, (part.height * W) / c.width)
  }
  pdf.save(`${name}.pdf`)
}
async function toImage(node, name) {
  const c = await snapshot(node)
  download(c.toDataURL('image/png'), `${name}.png`)
}
// prints only the report (as an image) — avoids the whole-page print freeze
async function toPrinter(node, name, landscape) {
  const c = await snapshot(node)
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentWindow.document
  d.open()
  d.write(`<!doctype html><html><head><title>${name}</title>
    <style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}body{margin:0}img{width:100%}</style></head>
    <body><img src="${c.toDataURL('image/png')}"></body></html>`)
  d.close()
  await new Promise((r) => { const img = d.querySelector('img'); img.complete ? r() : (img.onload = r) })
  f.contentWindow.focus()
  f.contentWindow.print()
  setTimeout(() => f.remove(), 1000)
}

/* ---------- build the group tree ---------- */
function blank(name, key) {
  return { name, key, dr: 0, cr: 0, opening: 0, debit: 0, credit: 0, kids: [] }
}
function add(node, l) {
  if (l.closing >= 0) node.dr += l.closing; else node.cr += -l.closing
  node.opening += l.opening; node.debit += l.debit; node.credit += l.credit
}
function buildTree(rows) {
  const prim = new Map()
  for (const r of rows) {
    const l = {
      ledger: true, key: 'l' + r.ledger_id, id: r.ledger_id, name: r.ledger_name,
      opening: Number(r.opening) || 0, debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0, closing: Number(r.closing) || 0,
    }
    const pName = r.primary_group || r.group_name || 'Other'
    if (!prim.has(pName)) prim.set(pName, blank(pName, 'p:' + pName))
    const p = prim.get(pName)
    add(p, l)
    let parent = p
    if (r.group_name && r.group_name !== pName) {
      let g = p.kids.find((k) => !k.ledger && k.name === r.group_name)
      if (!g) { g = blank(r.group_name, 'g:' + pName + '/' + r.group_name); p.kids.push(g) }
      add(g, l)
      parent = g
    }
    parent.kids.push(l)
  }
  return [...prim.values()].sort((a, b) => rank(a.name) - rank(b.name))
}
const allGroupKeys = (nodes) => nodes.flatMap((n) => (n.ledger ? [] : [n.key, ...allGroupKeys(n.kids)]))

export default function TrialBalance() {
  const [from, setFrom] = useState(bsFyStart())
  const [to, setTo] = useState(todayBs())
  const [shown, setShown] = useState({ from: bsFyStart(), to: todayBs() })
  const [rows, setRows] = useState([])
  const [hideZero, setHideZero] = useState(true)
  const [period, setPeriod] = useState(false)          // show opening / debit / credit columns
  const [view, setView] = useState('condensed')
  const [open, setOpen] = useState(() => new Set())
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const report = useRef(null)

  function load() {
    setErr('')
    api.trialBalance(bsToAd(from), bsToAd(to))
      .then((r) => { setRows(r); setShown({ from, to }) })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  const visible = rows.filter((r) => !hideZero ||
    Number(r.opening) || Number(r.debit) || Number(r.credit) || Number(r.closing))
  const tree = useMemo(() => buildTree(visible), [rows, hideZero])
  const keys = allGroupKeys(tree)

  useEffect(() => { if (view === 'expanded') setOpen(new Set(keys)) }, [rows, hideZero])

  function setMode(m) { setView(m); setOpen(m === 'expanded' ? new Set(keys) : new Set()) }
  function toggle(k) {
    setOpen((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  const totDr = tree.reduce((s, n) => s + n.dr, 0)
  const totCr = tree.reduce((s, n) => s + n.cr, 0)
  const totDebit = tree.reduce((s, n) => s + n.debit, 0)
  const totCredit = tree.reduce((s, n) => s + n.credit, 0)
  const diff = +(totDr - totCr).toFixed(2)
  const grand = Math.max(totDr, totCr)

  /* ---------- exports ---------- */
  const fileBase = `trial-balance_${shown.from}_to_${shown.to}`
  async function run(label, fn) {
    if (busy) return
    setBusy(label); setErr('')
    try { await fn() } catch (e) { setErr(e.message || String(e)) } finally { setBusy('') }
  }

  function exportCsv() {
    downloadCsv(
      'trial-balance',
      ['Primary Group', 'Group', 'Ledger', 'Opening', 'Opening Dr/Cr', 'Debit', 'Credit', 'Closing Dr', 'Closing Cr'],
      visible.map((r) => {
        const o = drcr(r.opening), c = Number(r.closing) || 0
        return [r.primary_group, r.group_name, r.ledger_name, num(o.amount), o.amount ? o.side : '',
                num(r.debit), num(r.credit), c > 0 ? num(c) : '', c < 0 ? num(-c) : '']
      }),
      [COMPANY, 'Trial Balance', `Period: ${shown.from} to ${shown.to} (BS)`]
    )
  }

  /* ---------- rendering ---------- */
  const cols = period ? 5 : 2
  const amt = (v) => (v ? money(v) : '')

  function renderNode(n, depth) {
    const pad = 14 + depth * 22
    if (n.ledger) {
      const o = drcr(n.opening)
      return (
        <tr key={n.key} style={{ fontSize: 14, color: '#374151' }}>
          <td style={{ ...st.td, paddingLeft: pad + 20 }}>
            <Link to={`/statement?ledger=${n.id}`} style={{ color: 'inherit' }}>{n.name}</Link>
          </td>
          {period && <td style={st.num}>{o.amount ? `${money(o.amount)} ${o.side}` : ''}</td>}
          {period && <td style={st.num}>{amt(n.debit)}</td>}
          {period && <td style={st.num}>{amt(n.credit)}</td>}
          <td style={st.num}>{n.closing > 0 ? money(n.closing) : ''}</td>
          <td style={st.num}>{n.closing < 0 ? money(-n.closing) : ''}</td>
        </tr>
      )
    }
    const isOpen = open.has(n.key)
    const o = drcr(n.opening)
    return [
      <tr key={n.key} style={{ cursor: 'pointer', ...(depth ? { fontStyle: 'italic' } : null) }}
          onClick={() => toggle(n.key)} title={isOpen ? 'Click to close' : 'Click to open'}>
        <td style={{ ...st.td, paddingLeft: pad, fontWeight: depth ? 600 : 700 }}>
          <span style={st.caret}>{isOpen ? '▾' : '▸'}</span>{n.name}
        </td>
        {period && <td style={st.num}>{o.amount ? `${money(o.amount)} ${o.side}` : ''}</td>}
        {period && <td style={st.num}>{amt(n.debit)}</td>}
        {period && <td style={st.num}>{amt(n.credit)}</td>}
        <td style={{ ...st.num, fontWeight: depth ? 500 : 700 }}>{amt(n.dr)}</td>
        <td style={{ ...st.num, fontWeight: depth ? 500 : 700 }}>{amt(n.cr)}</td>
      </tr>,
      ...(isOpen ? n.kids.flatMap((k) => renderNode(k, depth + 1)) : []),
    ]
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Trial Balance</h1>
          <p className="sub">{longBs(shown.from)} to {longBs(shown.to)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="small muted" style={{ marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>View</div>
          <div role="tablist" style={st.segWrap}>
            {['condensed', 'expanded'].map((m) => (
              <button key={m} type="button" role="tab" aria-selected={view === m}
                      style={{ ...st.segBtn, ...(view === m ? st.segOn : null) }} onClick={() => setMode(m)}>
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
        <button className="ghost" disabled={!!busy} onClick={() => run('pdf', () => toPdf(report.current, fileBase, period))}>
          {busy === 'pdf' ? 'Preparing…' : 'PDF'}</button>
        <button className="ghost" disabled={!!busy} onClick={() => run('image', () => toImage(report.current, fileBase))}>
          {busy === 'image' ? 'Preparing…' : 'Image'}</button>
        <button className="ghost" disabled={!!busy} onClick={() => run('print', () => toPrinter(report.current, fileBase, period))}>
          {busy === 'print' ? 'Preparing…' : 'Print'}</button>
        <button className="ghost" onClick={exportCsv}>CSV</button>
      </div>
      <div className="toolbar" style={{ marginTop: -6 }}>
        <label className="small"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> hide nil accounts</label>
        <label className="small"><input type="checkbox" checked={period} onChange={(e) => setPeriod(e.target.checked)} /> show opening &amp; period movement</label>
      </div>

      {/* everything inside this box is what PDF / Image / Print capture */}
      <div ref={report} style={st.report}>
        <table style={st.table}>
          <thead>
            <tr>
              <th rowSpan={3} style={{ ...st.th, textAlign: 'left', letterSpacing: '.25em', verticalAlign: 'middle' }}>Particulars</th>
              <th colSpan={period ? 5 : 2} style={st.thTitle}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{COMPANY}</div>
                <div style={{ fontWeight: 400, fontSize: 13 }}>
                  {longBs(shown.from)} to {longBs(shown.to)}
                  <div style={{ color: '#9aa3a0', fontSize: 12 }}>{bsToAd(shown.from)} to {bsToAd(shown.to)}</div>
                </div>
              </th>
            </tr>
            <tr>
              {period && <th rowSpan={2} style={st.th}>Opening</th>}
              {period && <th rowSpan={2} style={st.th}>Debit</th>}
              {period && <th rowSpan={2} style={st.th}>Credit</th>}
              <th colSpan={2} style={st.th}>Closing Balance</th>
            </tr>
            <tr>
              <th style={{ ...st.th, fontWeight: 500 }}>Debit</th>
              <th style={{ ...st.th, fontWeight: 500 }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {tree.flatMap((n) => renderNode(n, 0))}
            {diff !== 0 && (
              <tr style={{ fontStyle: 'italic' }}>
                <td style={{ ...st.td, paddingLeft: 34 }}>Difference in opening balances</td>
                {period && <td style={st.num} />}{period && <td style={st.num} />}{period && <td style={st.num} />}
                <td style={st.num}>{diff < 0 ? money(-diff) : ''}</td>
                <td style={st.num}>{diff > 0 ? money(diff) : ''}</td>
              </tr>
            )}
            {!tree.length && <tr><td colSpan={1 + cols} style={{ ...st.td, color: '#6b7280' }}>Nothing to show.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...st.foot, letterSpacing: '.25em' }}>Grand Total</td>
              {period && <td style={st.footNum} />}
              {period && <td style={st.footNum}>{money(totDebit)}</td>}
              {period && <td style={st.footNum}>{money(totCredit)}</td>}
              <td style={st.footNum}>{money(grand)}</td>
              <td style={st.footNum}>{money(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {diff !== 0 && (
        <p className="err" style={{ marginTop: 12 }}>
          Opening balances differ by {money(Math.abs(diff))} — check the opening balances on the Ledgers screen.
        </p>
      )}
    </>
  )
}

const st = {
  report: {
    background: '#fff', border: '1px solid #cfd8d3', borderRadius: 10, overflow: 'auto',
    fontVariantNumeric: 'tabular-nums', color: '#111827',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 15 },
  thTitle: { textAlign: 'center', padding: '10px 12px', borderLeft: '1px solid #cfd8d3', borderBottom: '1px solid #cfd8d3', lineHeight: 1.4 },
  th: {
    textAlign: 'center', padding: '6px 12px', fontWeight: 700, fontSize: 13, background: '#f1f5f2',
    borderLeft: '1px solid #cfd8d3', borderBottom: '1px solid #cfd8d3', whiteSpace: 'nowrap',
  },
  td: { padding: '6px 14px', borderBottom: '1px solid #f1f3f2' },
  num: { padding: '6px 14px', textAlign: 'right', whiteSpace: 'nowrap', borderLeft: '1px solid #eef1ef', borderBottom: '1px solid #f1f3f2', width: 150 },
  caret: { display: 'inline-block', width: 16, color: '#6b7280', fontSize: 12, fontStyle: 'normal' },
  foot: { padding: '9px 14px', fontWeight: 700, borderTop: '1.5px solid #111827' },
  footNum: { padding: '9px 14px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1.5px solid #111827', borderLeft: '1px solid #eef1ef' },
  segWrap: { display: 'inline-flex', padding: 4, gap: 4, borderRadius: 999, background: '#eef2ef', border: '1px solid #dfe6e1' },
  segBtn: { border: 0, background: 'transparent', color: '#4b5563', cursor: 'pointer', padding: '8px 18px', borderRadius: 999, fontSize: 15, fontWeight: 500 },
  segOn: { background: GREEN, color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)' },
}
