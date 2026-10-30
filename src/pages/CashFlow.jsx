import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, api, money } from '../lib/api'
import { downloadCsv, num, COMPANY } from '../lib/csv'
import NepaliDateInput, { bsToAd, todayBs, bsFyStart, longBs } from '../components/NepaliDateInput'

/*
  Cash Flow — where cash & bank money came from and where it went.
  Reads every voucher line in the period. For each voucher that touches
  cash or bank, the other lines say what the money was for.
  Contra (cash ↔ bank) moves money between your own accounts, so it is left out.
*/

const GREEN = 'var(--primary, #17532f)'

/* ---------- categories (plain language) ---------- */
const CATS = {
  sales:     { section: 'Day-to-day business', label: 'Sales & other income' },
  customers: { section: 'Day-to-day business', label: 'Received from customers' },
  purchases: { section: 'Day-to-day business', label: 'Purchases' },
  suppliers: { section: 'Day-to-day business', label: 'Paid to suppliers' },
  expenses:  { section: 'Day-to-day business', label: 'Expenses (wages, fuel, rent…)' },
  taxes:     { section: 'Day-to-day business', label: 'Taxes & other payables' },
  advances:  { section: 'Day-to-day business', label: 'Advances & deposits' },
  assets:    { section: 'Assets', label: 'Assets bought / sold' },
  loans:     { section: 'Loans & owner', label: 'Loans & deposits (received / repaid)' },
  interest:  { section: 'Loans & owner', label: 'Interest on loans' },
  capital:   { section: "Loans & owner", label: "Owner's capital / drawings" },
  other:     { section: 'Other', label: 'Other' },
}
const SECTIONS = ['Day-to-day business', 'Assets', 'Loans & owner', 'Other']

const txt = (l) => `${l?.group_name || ''} | ${l?.primary_group || ''}`.toLowerCase()
const isCash = (l) => /cash|bank/.test(txt(l))

function categoryOf(l) {
  const g = txt(l)
  const name = String(l?.name || '').toLowerCase()
  const expenseGroup = /expense/.test(g)
  if (/interest/.test(name + ' ' + g) && (expenseGroup || /loan/.test(g))) return 'interest'
  if (/sales|income/.test(g)) return 'sales'
  if (/purchase/.test(g)) return 'purchases'
  if (expenseGroup) return 'expenses'
  if (/sundry debtor|debtor/.test(g)) return 'customers'
  if (/sundry creditor|creditor/.test(g)) return 'suppliers'
  if (/loan|deposit.*liab|unsecured|secured/.test(g) && !/advance/.test(g)) return 'loans'
  if (/capital|reserve/.test(g)) return 'capital'
  if (/fixed asset|investment/.test(g)) return 'assets'
  if (/duties|tax|provision|current liabilit/.test(g)) return 'taxes'
  if (/advance|deposit|current asset|stock/.test(g)) return 'advances'
  return 'other'
}

/* ---------- data: read all lines in pages of 1000 ---------- */
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) return out
  }
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
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const M = 10, W = 190, H = 277
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
    <style>@page{size:A4 portrait;margin:10mm}body{margin:0}img{width:100%}</style></head>
    <body><img src="${c.toDataURL('image/png')}"></body></html>`)
  d.close()
  await new Promise((r) => { const img = d.querySelector('img'); img.complete ? r() : (img.onload = r) })
  f.contentWindow.focus()
  f.contentWindow.print()
  setTimeout(() => f.remove(), 1000)
}

export default function CashFlow() {
  const [from, setFrom] = useState(bsFyStart())
  const [to, setTo] = useState(todayBs())
  const [shown, setShown] = useState({ from: bsFyStart(), to: todayBs() })
  const [data, setData] = useState(null)
  const [view, setView] = useState('condensed')
  const [open, setOpen] = useState(() => new Set())
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const report = useRef(null)

  async function load() {
    setErr(''); setLoading(true)
    try {
      const fromAd = bsToAd(from), toAd = bsToAd(to)
      const ledgers = await api.ledgers()
      const byId = new Map(ledgers.map((l) => [String(l.id), l]))
      const cashLedgers = ledgers.filter(isCash)
      const cashIds = cashLedgers.map((l) => l.id)

      // cash & bank lines before the period → opening balance
      const before = cashIds.length ? await fetchAll(() => supabase
        .from('voucher_entries')
        .select('id,ledger_id,debit,credit,vouchers!inner(date,is_cancelled)')
        .in('ledger_id', cashIds)
        .lt('vouchers.date', fromAd)
        .eq('vouchers.is_cancelled', false)
        .order('id')) : []

      // every line inside the period
      const lines = await fetchAll(() => supabase
        .from('voucher_entries')
        .select('id,voucher_id,ledger_id,debit,credit,vouchers!inner(date,voucher_no,is_cancelled)')
        .gte('vouchers.date', fromAd)
        .lte('vouchers.date', toAd)
        .eq('vouchers.is_cancelled', false)
        .order('id'))

      // per cash/bank account: opening and closing
      const acct = new Map(cashLedgers.map((l) => {
        const ob = Number(l.opening_balance) || 0
        return [String(l.id), { id: l.id, name: l.name, opening: l.opening_type === 'Cr' ? -ob : ob, closing: 0 }]
      }))
      for (const e of before) acct.get(String(e.ledger_id)).opening += Number(e.debit) - Number(e.credit)
      for (const a of acct.values()) a.closing = a.opening
      for (const e of lines) {
        const a = acct.get(String(e.ledger_id))
        if (a) a.closing += Number(e.debit) - Number(e.credit)
      }

      // group lines by voucher, then read what each cash movement was for
      const vouchers = new Map()
      for (const e of lines) {
        const k = String(e.voucher_id)
        if (!vouchers.has(k)) vouchers.set(k, [])
        vouchers.get(k).push(e)
      }
      const cats = {}
      for (const ls of vouchers.values()) {
        if (!ls.some((e) => acct.has(String(e.ledger_id)))) continue          // no cash/bank → not a cash flow
        for (const e of ls) {
          if (acct.has(String(e.ledger_id))) continue                          // cash ↔ bank: own money moving
          const l = byId.get(String(e.ledger_id))
          const flow = Number(e.credit) - Number(e.debit)                       // + = money in, − = money out
          if (!flow) continue
          const c = categoryOf(l)
          cats[c] ??= { key: c, in: 0, out: 0, ledgers: new Map() }
          const cat = cats[c]
          if (flow > 0) cat.in += flow; else cat.out += -flow
          const lk = String(e.ledger_id)
          if (!cat.ledgers.has(lk)) cat.ledgers.set(lk, { id: e.ledger_id, name: l?.name || '?', in: 0, out: 0 })
          const x = cat.ledgers.get(lk)
          if (flow > 0) x.in += flow; else x.out += -flow
        }
      }

      const accounts = [...acct.values()].filter((a) => a.opening || a.closing)
      setData({
        cats,
        accounts,
        opening: accounts.reduce((s, a) => s + a.opening, 0),
        closing: accounts.reduce((s, a) => s + a.closing, 0),
      })
      setShown({ from, to })
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const ORDER = Object.keys(CATS)
  const catList = data ? Object.values(data.cats).sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)) : []
  const totalIn = catList.reduce((s, c) => s + c.in, 0)
  const totalOut = catList.reduce((s, c) => s + c.out, 0)
  const keys = catList.map((c) => c.key)

  useEffect(() => { if (view === 'expanded') setOpen(new Set(keys)) }, [data])
  function setMode(m) { setView(m); setOpen(m === 'expanded' ? new Set(keys) : new Set()) }
  function toggle(k) { setOpen((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n }) }

  const fileBase = `cash-flow_${shown.from}_to_${shown.to}`
  async function run(label, fn) {
    if (busy) return
    setBusy(label); setErr('')
    try { await fn() } catch (e) { setErr(e.message || String(e)) } finally { setBusy('') }
  }

  function exportCsv() {
    if (!data) return
    const body = [['', '', 'Opening cash & bank', '', '', num(data.opening)]]
    for (const sec of SECTIONS) for (const c of catList.filter((x) => CATS[x.key].section === sec))
      for (const l of c.ledgers.values()) body.push([sec, CATS[c.key].label, l.name, num(l.in), num(l.out), ''])
    body.push(['', '', 'TOTAL', num(totalIn), num(totalOut), ''])
    body.push(['', '', 'Closing cash & bank', '', '', num(data.closing)])
    downloadCsv('cash-flow', ['Section', 'Category', 'Ledger', 'Money in', 'Money out', 'Balance'], body,
      [COMPANY, 'Cash Flow', `Period: ${shown.from} to ${shown.to} (BS)`])
  }

  /* ---------- rendering ---------- */
  const signed = (v) => (v < 0 ? `(−) ${money(-v)}` : money(v))
  const cell = (v, color) => <td style={{ ...st.num, color: v ? color : '#9ca3af' }}>{v ? money(v) : '—'}</td>

  function sectionRows(sec) {
    const list = catList.filter((c) => CATS[c.key].section === sec)
    if (!list.length) return null
    const sIn = list.reduce((s, c) => s + c.in, 0), sOut = list.reduce((s, c) => s + c.out, 0)
    return [
      <tr key={'h' + sec}><td colSpan={4} style={st.section}>{sec}</td></tr>,
      ...list.flatMap((c) => {
        const isOpen = open.has(c.key)
        return [
          <tr key={c.key} style={{ cursor: 'pointer' }} onClick={() => toggle(c.key)}
              title={isOpen ? 'Click to close' : 'Click to show ledgers'}>
            <td style={{ ...st.td, fontWeight: 600 }}><span style={st.caret}>{isOpen ? '▾' : '▸'}</span>{CATS[c.key].label}</td>
            {cell(c.in, '#15803d')}
            {cell(c.out, '#b42318')}
            <td style={{ ...st.num, fontWeight: 600 }}>{signed(c.in - c.out)}</td>
          </tr>,
          ...(isOpen ? [...c.ledgers.values()].map((l) => (
            <tr key={c.key + l.id} style={{ fontSize: 14, color: '#374151' }}>
              <td style={{ ...st.td, paddingLeft: 52 }}>
                <Link to={`/statement?ledger=${l.id}`} style={{ color: 'inherit' }}>{l.name}</Link>
              </td>
              <td style={{ ...st.num, fontStyle: 'italic' }}>{l.in ? money(l.in) : ''}</td>
              <td style={{ ...st.num, fontStyle: 'italic' }}>{l.out ? money(l.out) : ''}</td>
              <td style={st.num} />
            </tr>
          )) : []),
        ]
      }),
      <tr key={'t' + sec} style={{ background: '#fafbfa' }}>
        <td style={{ ...st.td, fontStyle: 'italic', color: '#4b5563' }}>Net — {sec.toLowerCase()}</td>
        <td style={st.num} /><td style={st.num} />
        <td style={{ ...st.num, fontWeight: 700, color: sIn - sOut >= 0 ? '#15803d' : '#b42318' }}>{signed(sIn - sOut)}</td>
      </tr>,
    ]
  }

  const net = totalIn - totalOut

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Cash Flow</h1>
          <p className="sub">Where your cash &amp; bank money came from and where it went · {longBs(shown.from)} to {longBs(shown.to)}</p>
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
        <button className="primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Show'}</button>
        <button className="ghost" disabled={!!busy || !data} onClick={() => run('pdf', () => toPdf(report.current, fileBase))}>
          {busy === 'pdf' ? 'Preparing…' : 'PDF'}</button>
        <button className="ghost" disabled={!!busy || !data} onClick={() => run('image', () => toImage(report.current, fileBase))}>
          {busy === 'image' ? 'Preparing…' : 'Image'}</button>
        <button className="ghost" disabled={!!busy || !data} onClick={() => run('print', () => toPrinter(report.current, fileBase))}>
          {busy === 'print' ? 'Preparing…' : 'Print'}</button>
        <button className="ghost" disabled={!data} onClick={exportCsv}>CSV</button>
      </div>

      {data && (
        <div ref={report} style={st.report}>
          <div style={st.titleBar}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{COMPANY}</div>
            <div style={{ fontWeight: 600 }}>Cash Flow</div>
            <div style={{ fontSize: 13, color: '#4b5563' }}>
              {longBs(shown.from)} to {longBs(shown.to)}
              <span style={{ color: '#9aa3a0' }}> · {bsToAd(shown.from)} to {bsToAd(shown.to)}</span>
            </div>
          </div>

          {/* the four numbers that matter */}
          <div style={st.tiles}>
            <div style={st.tile}><div style={st.tileLbl}>Opening cash &amp; bank</div><div style={st.tileVal}>{signed(data.opening)}</div></div>
            <div style={st.tile}><div style={st.tileLbl}>Money in</div><div style={{ ...st.tileVal, color: '#15803d' }}>+ {money(totalIn)}</div></div>
            <div style={st.tile}><div style={st.tileLbl}>Money out</div><div style={{ ...st.tileVal, color: '#b42318' }}>− {money(totalOut)}</div></div>
            <div style={{ ...st.tile, background: '#eef6f1' }}><div style={st.tileLbl}>Closing cash &amp; bank</div><div style={st.tileVal}>{signed(data.closing)}</div></div>
          </div>

          <table style={st.table}>
            <thead>
              <tr>
                <th style={{ ...st.th, textAlign: 'left' }}>Particulars</th>
                <th style={st.th}>Money in</th>
                <th style={st.th}>Money out</th>
                <th style={st.th}>Net</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...st.td, fontWeight: 700 }}>Opening cash &amp; bank ({longBs(shown.from)})</td>
                <td style={st.num} /><td style={st.num} />
                <td style={{ ...st.num, fontWeight: 700 }}>{signed(data.opening)}</td>
              </tr>
              {SECTIONS.flatMap(sectionRows)}
              {!catList.length && <tr><td colSpan={4} style={{ ...st.td, color: '#6b7280' }}>No cash or bank movements in this period.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td style={st.foot}>Total</td>
                <td style={{ ...st.footNum, color: '#15803d' }}>{money(totalIn)}</td>
                <td style={{ ...st.footNum, color: '#b42318' }}>{money(totalOut)}</td>
                <td style={{ ...st.footNum, color: net >= 0 ? '#15803d' : '#b42318' }}>{signed(net)}</td>
              </tr>
              <tr>
                <td style={{ ...st.foot, borderTop: 0 }}>Closing cash &amp; bank ({longBs(shown.to)})</td>
                <td style={{ ...st.footNum, borderTop: 0 }} /><td style={{ ...st.footNum, borderTop: 0 }} />
                <td style={{ ...st.footNum, borderTop: 0 }}>{signed(data.closing)}</td>
              </tr>
            </tfoot>
          </table>

          {/* where the closing money sits */}
          <div style={{ padding: '12px 14px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.03em', color: '#374151', marginBottom: 6 }}>
              Cash &amp; bank accounts
            </div>
            <table style={{ ...st.table, fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...st.th, textAlign: 'left' }}>Account</th>
                  <th style={st.th}>Opening</th>
                  <th style={st.th}>Closing</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id}>
                    <td style={st.td}><Link to={`/statement?ledger=${a.id}`} style={{ color: 'inherit' }}>{a.name}</Link></td>
                    <td style={{ ...st.num, color: a.opening < 0 ? '#b42318' : undefined }}>{signed(a.opening)}</td>
                    <td style={{ ...st.num, color: a.closing < 0 ? '#b42318' : undefined }}>{signed(a.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.accounts.some((a) => a.closing < 0) && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#b42318' }}>
                A negative cash or bank balance usually means an opening balance or some money received has not been entered yet.
              </div>
            )}
          </div>
        </div>
      )}
      {!data && !err && <p className="muted">Loading…</p>}
    </>
  )
}

const st = {
  report: { background: '#fff', border: '1px solid #cfd8d3', borderRadius: 10, overflow: 'auto', fontVariantNumeric: 'tabular-nums', color: '#111827' },
  titleBar: { textAlign: 'center', padding: '14px 12px 10px', borderBottom: '1px solid #cfd8d3', lineHeight: 1.5 },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: 14, borderBottom: '1px solid #cfd8d3' },
  tile: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' },
  tileLbl: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.03em' },
  tileVal: { fontSize: 20, fontWeight: 700, marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 15 },
  th: { textAlign: 'right', padding: '8px 14px', fontWeight: 700, fontSize: 13, background: '#f1f5f2', borderBottom: '1px solid #cfd8d3', whiteSpace: 'nowrap' },
  section: { padding: '12px 14px 4px', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: GREEN },
  td: { padding: '6px 14px', borderBottom: '1px solid #f1f3f2' },
  num: { padding: '6px 14px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f3f2', width: 140 },
  caret: { display: 'inline-block', width: 16, color: '#6b7280', fontSize: 12 },
  foot: { padding: '9px 14px', fontWeight: 700, borderTop: '1.5px solid #111827' },
  footNum: { padding: '9px 14px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1.5px solid #111827' },
  segWrap: { display: 'inline-flex', padding: 4, gap: 4, borderRadius: 999, background: '#eef2ef', border: '1px solid #dfe6e1' },
  segBtn: { border: 0, background: 'transparent', color: '#4b5563', cursor: 'pointer', padding: '8px 18px', borderRadius: 999, fontSize: 15, fontWeight: 500 },
  segOn: { background: GREEN, color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)' },
}
