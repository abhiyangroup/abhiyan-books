import { useEffect, useMemo, useRef, useState } from 'react'
import { api, money } from '../lib/api'
import { downloadCsv, num, COMPANY } from '../lib/csv'
import NepaliDateInput, { bsToAd, todayBs, bsFyStart, longBs } from '../components/NepaliDateInput'

/*
  Tally-style Balance Sheet: Liabilities left, Assets right.
  Condensed: one line per primary group. Click a group to open it;
  Expanded opens every group down to ledgers.
  Profit & Loss A/c (opening + current period) is added from the books.
*/

const GREEN = 'var(--primary, #17532f)'

const ORDER = [
  'capital account', 'reserves & surplus', 'loans (liability)', 'current liabilities', 'suspense a/c',
  'profit & loss a/c',
  'fixed assets', 'investments', 'current assets', 'misc. expenses (asset)',
]
const rank = (name) => {
  if (/^difference in opening/i.test(name)) return 999   // always last, as in Tally
  const i = ORDER.indexOf(String(name).toLowerCase())
  return i < 0 ? 500 : i
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
async function toPdf(node, name) {
  const c = await snapshot(node)
  await loadScript(JSPDF)
  const { jsPDF } = window.jspdf
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const M = 10, W = 277, H = 190
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
async function toPrinter(node, name) {
  const c = await snapshot(node)
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const d = f.contentWindow.document
  d.open()
  d.write(`<!doctype html><html><head><title>${name}</title>
    <style>@page{size:A4 landscape;margin:10mm}body{margin:0}img{width:100%}</style></head>
    <body><img src="${c.toDataURL('image/png')}"></body></html>`)
  d.close()
  await new Promise((r) => { const img = d.querySelector('img'); img.complete ? r() : (img.onload = r) })
  f.contentWindow.focus()
  f.contentWindow.print()
  setTimeout(() => f.remove(), 1000)
}

/* ---------- group tree ---------- */
function buildSide(rows) {
  const prim = new Map()
  for (const r of rows) {
    const amount = Number(r.amount) || 0
    const pName = r.primary_group || r.group_name || 'Other'
    if (!prim.has(pName)) prim.set(pName, { key: 'p:' + pName, name: pName, amount: 0, kids: [] })
    const p = prim.get(pName)
    p.amount += amount
    let parent = p
    if (r.group_name && r.group_name !== pName) {
      let g = p.kids.find((k) => k.kids && k.name === r.group_name)
      if (!g) { g = { key: 'g:' + pName + '/' + r.group_name, name: r.group_name, amount: 0, kids: [] }; p.kids.push(g) }
      g.amount += amount
      parent = g
    }
    parent.kids.push({ key: 'l:' + pName + '/' + r.ledger_name, name: r.ledger_name, amount })
  }
  return [...prim.values()]
}
const groupKeys = (nodes) => nodes.flatMap((n) => (n.kids ? [n.key, ...groupKeys(n.kids)] : []))

// AD date one day before an AD 'YYYY-MM-DD'
function dayBefore(ad) {
  const d = new Date(ad + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function BalanceSheet() {
  const [asOn, setAsOn] = useState(todayBs())
  const [shown, setShown] = useState(todayBs())
  const [rows, setRows] = useState([])
  const [pl, setPl] = useState({ opening: 0, current: 0 })
  const [view, setView] = useState('condensed')
  const [open, setOpen] = useState(() => new Set())
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const report = useRef(null)

  function load() {
    setErr('')
    const ad = bsToAd(asOn)
    const fyAd = bsToAd(bsFyStart(asOn))
    Promise.all([
      api.balanceSheet(ad),
      api.netProfit(fyAd, ad).catch(() => 0),                            // this year up to the date
      api.netProfit('1943-04-14', dayBefore(fyAd)).catch(() => 0),       // all earlier years
    ])
      .then(([r, cur, prev]) => {
        setRows(r)
        setPl({ opening: Number(prev) || 0, current: Number(cur) || 0 })
        setShown(asOn)
      })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  // if the server already returns a Profit & Loss line, don't add a second one
  const serverHasPl = rows.some((r) => /profit\s*&?\s*(and\s*)?loss/i.test(`${r.ledger_name} ${r.group_name}`))

  const { liabs, assets, totL, totA } = useMemo(() => {
    const liabs = buildSide(rows.filter((r) => r.side === 'liabilities'))
    const assets = buildSide(rows.filter((r) => r.side === 'assets'))

    if (!serverHasPl && (pl.opening || pl.current)) {
      const total = pl.opening + pl.current
      const sign = total >= 0 ? 1 : -1                         // profit → liabilities, loss → assets
      const node = {
        key: 'p:pl', name: 'Profit & Loss A/c', amount: Math.abs(total), pl: true,
        kids: [
          { key: 'pl:o', name: 'Opening Balance', amount: sign * pl.opening },
          { key: 'pl:c', name: 'Current Period', amount: sign * pl.current },
        ],
      }
      ;(total >= 0 ? liabs : assets).push(node)
    }

    const sum = (list) => list.reduce((s, n) => s + n.amount, 0)
    let totL = sum(liabs), totA = sum(assets)
    const diff = +(totA - totL).toFixed(2)
    if (diff) {
      const node = { key: 'p:diff', name: 'Difference in opening balances', amount: Math.abs(diff), diff: true }
      ;(diff > 0 ? liabs : assets).push(node)
    }
    liabs.sort((a, b) => rank(a.name) - rank(b.name))
    assets.sort((a, b) => rank(a.name) - rank(b.name))
    totL = sum(liabs); totA = sum(assets)
    return { liabs, assets, totL, totA }
  }, [rows, pl, serverHasPl])

  const keys = [...groupKeys(liabs), ...groupKeys(assets)]
  useEffect(() => { if (view === 'expanded') setOpen(new Set(keys)) }, [rows, pl])

  function setMode(m) { setView(m); setOpen(m === 'expanded' ? new Set(keys) : new Set()) }
  function toggle(k) {
    setOpen((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  const diffNode = [...liabs, ...assets].find((n) => n.diff)

  /* ---------- exports ---------- */
  const fileBase = `balance-sheet_${shown}`
  async function run(label, fn) {
    if (busy) return
    setBusy(label); setErr('')
    try { await fn() } catch (e) { setErr(e.message || String(e)) } finally { setBusy('') }
  }

  function exportCsv() {
    const body = []
    const walk = (side, nodes, path = []) => {
      for (const n of nodes) {
        if (n.kids) walk(side, n.kids, [...path, n.name])
        else body.push([side, path[0] || n.name, path[1] || '', n.name, num(n.amount)])
      }
    }
    walk('Liabilities', liabs)
    body.push(['', '', '', 'TOTAL LIABILITIES', num(totL)])
    walk('Assets', assets)
    body.push(['', '', '', 'TOTAL ASSETS', num(totA)])
    downloadCsv('balance-sheet', ['Side', 'Primary Group', 'Group', 'Ledger', 'Amount'], body,
      [COMPANY, 'Balance Sheet', `As on: ${shown} (BS) / ${bsToAd(shown)} (AD)`])
  }

  /* ---------- rendering ---------- */
  function renderNode(n, depth) {
    const pad = 14 + depth * 20
    const amountCell = depth === 0 ? st.amt : st.sub
    if (!n.kids) {
      return (
        <div key={n.key} style={{ ...st.row, paddingLeft: pad + 18, fontSize: 14, color: '#374151',
                                  ...(n.diff ? { fontStyle: 'italic', color: '#b42318' } : null) }}>
          <span style={{ flex: 1 }}>{n.name}</span>
          <span style={amountCell}>{money(n.amount)}</span>
          {depth > 0 && <span style={st.amt} />}
        </div>
      )
    }
    const isOpen = open.has(n.key)
    return (
      <div key={n.key}>
        <div style={{ ...st.row, paddingLeft: pad, cursor: 'pointer', ...(depth ? { fontStyle: 'italic' } : null) }}
             onClick={() => toggle(n.key)} title={isOpen ? 'Click to close' : 'Click to open'}>
          <span style={st.caret}>{isOpen ? '▾' : '▸'}</span>
          <span style={{ flex: 1, fontWeight: depth ? 600 : 700 }}>{n.name}</span>
          <span style={{ ...amountCell, fontWeight: depth ? 500 : 700 }}>{money(n.amount)}</span>
          {depth > 0 && <span style={st.amt} />}
        </div>
        {isOpen && n.kids.map((k) => renderNode(k, depth + 1))}
      </div>
    )
  }

  const side = (title, nodes, total) => (
    <div style={st.side}>
      <div style={st.head}><span style={{ letterSpacing: '.2em' }}>{title}</span><span style={{ fontWeight: 400, fontSize: 12 }}>as on {longBs(shown)}</span></div>
      <div style={{ flex: 1, paddingTop: 6 }}>
        {nodes.map((n) => renderNode(n, 0))}
        {!nodes.length && <div style={{ ...st.row, color: '#6b7280' }}>Nothing to show.</div>}
      </div>
      <div style={st.total}><span style={{ letterSpacing: '.2em' }}>Total</span><span>{money(total)}</span></div>
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Balance Sheet</h1>
          <p className="sub">As on {longBs(shown)}</p>
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
        <div className="field"><label>As on (BS)</label>
          <NepaliDateInput value={asOn} onChange={setAsOn} /></div>
        <button className="primary" onClick={load}>Show</button>
        <button className="ghost" disabled={!!busy} onClick={() => run('pdf', () => toPdf(report.current, fileBase))}>
          {busy === 'pdf' ? 'Preparing…' : 'PDF'}</button>
        <button className="ghost" disabled={!!busy} onClick={() => run('image', () => toImage(report.current, fileBase))}>
          {busy === 'image' ? 'Preparing…' : 'Image'}</button>
        <button className="ghost" disabled={!!busy} onClick={() => run('print', () => toPrinter(report.current, fileBase))}>
          {busy === 'print' ? 'Preparing…' : 'Print'}</button>
        <button className="ghost" onClick={exportCsv}>CSV</button>
      </div>

      {/* everything inside this box is what PDF / Image / Print capture */}
      <div ref={report} style={st.report}>
        <div style={st.titleBar}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{COMPANY}</div>
          <div style={{ fontWeight: 600 }}>Balance Sheet</div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>
            as on {longBs(shown)}<span style={{ color: '#9aa3a0' }}> · {bsToAd(shown)}</span>
          </div>
        </div>
        <div style={st.block}>
          {side('Liabilities', liabs, totL)}
          {side('Assets', assets, totA)}
        </div>
      </div>

      {diffNode && (
        <p className="err" style={{ marginTop: 12 }}>
          Difference of {money(diffNode.amount)} — usually an opening balance that has not been entered yet.
        </p>
      )}
    </>
  )
}

const st = {
  report: {
    background: '#fff', border: '1px solid #cfd8d3', borderRadius: 10, overflow: 'hidden',
    fontVariantNumeric: 'tabular-nums', color: '#111827',
  },
  titleBar: { textAlign: 'center', padding: '14px 12px 10px', borderBottom: '1px solid #cfd8d3', lineHeight: 1.5 },
  block: { display: 'flex', flexWrap: 'wrap' },
  side: { flex: '1 1 360px', display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid #cfd8d3' },
  head: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '9px 14px',
    background: '#f1f5f2', borderBottom: '1px solid #cfd8d3', fontWeight: 700, fontSize: 14,
  },
  row: { display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 14px' },
  caret: { width: 14, color: '#6b7280', fontSize: 12, flex: 'none', fontStyle: 'normal' },
  amt: { width: 140, textAlign: 'right', flex: 'none' },
  sub: { width: 120, textAlign: 'right', flex: 'none', fontStyle: 'italic', color: '#4b5563' },
  total: {
    display: 'flex', justifyContent: 'space-between', padding: '9px 14px', fontWeight: 700,
    borderTop: '1.5px solid #111827', marginTop: 10,
  },
  segWrap: { display: 'inline-flex', padding: 4, gap: 4, borderRadius: 999, background: '#eef2ef', border: '1px solid #dfe6e1' },
  segBtn: { border: 0, background: 'transparent', color: '#4b5563', cursor: 'pointer', padding: '8px 18px', borderRadius: 999, fontSize: 15, fontWeight: 500 },
  segOn: { background: GREEN, color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)' },
}
