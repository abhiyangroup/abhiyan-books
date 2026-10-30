import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money } from '../lib/api'
import { BsDate, adToBs, bsToAd, todayBs, bsFyStart, longBs } from '../components/NepaliDateInput'

// "last opened" is remembered per browser
const LAST_OPEN_KEY = 'abhiyan-books:last-opened'

function readLastOpened() {
  try {
    const prev = localStorage.getItem(LAST_OPEN_KEY)
    localStorage.setItem(LAST_OPEN_KEY, new Date().toISOString())
    return prev
  } catch {
    return null
  }
}

const pad = (n) => String(n).padStart(2, '0')

// ISO timestamp -> '12 Kartik 2083, 1:45 PM' (local time)
function bsDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const bs = adToBs(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${longBs(bs)}, ${time}`
}

export default function Dashboard() {
  const [tb, setTb] = useState([])
  const [profit, setProfit] = useState(0)
  const [recent, setRecent] = useState([])
  const [lastTxn, setLastTxn] = useState('')
  const [lastOpened] = useState(readLastOpened)
  const [err, setErr] = useState('')

  const todayB = todayBs()
  const fyFromB = bsFyStart(todayB)

  useEffect(() => {
    Promise.all([
      api.trialBalance(null, null),
      api.netProfit(bsToAd(fyFromB), bsToAd(todayB)),   // Nepali fiscal year (from 1 Shrawan)
      api.daybook(),
    ])
      .then(([t, p, d]) => {
        setTb(t)
        setProfit(Number(p) || 0)
        // newest first by voucher date
        const sorted = [...d].sort((a, b) =>
          String(b.date).localeCompare(String(a.date)) || Number(b.id || 0) - Number(a.id || 0))
        setRecent(sorted.slice(0, 8))
        const live = sorted.find((v) => !v.is_cancelled)
        setLastTxn(live ? String(live.date).slice(0, 10) : '')
      })
      .catch((e) => setErr(e.message))
  }, [])

  const cash = tb.filter((r) => r.group_name === 'Cash-in-hand')
    .reduce((s, r) => s + Number(r.closing), 0)
  const bank = tb.filter((r) => r.group_name === 'Bank Accounts')
    .reduce((s, r) => s + Number(r.closing), 0)
  const debtors = tb.filter((r) => r.group_name === 'Sundry Debtors')
    .reduce((s, r) => s + Number(r.closing), 0)
  const creditors = tb.filter((r) => r.group_name === 'Sundry Creditors')
    .reduce((s, r) => s - Number(r.closing), 0)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Dashboard</h1>
          <p className="sub">
            Position as on {longBs(todayB)}
            <span className="muted small"> · {bsToAd(todayB)}</span>
          </p>
        </div>

        <div className="small" style={{
          textAlign: 'right', lineHeight: 1.6, padding: '8px 14px',
          border: '1px solid #dfe6e1', borderRadius: 10, background: '#fff',
        }}>
          <div>
            <span className="muted">Last transaction: </span>
            {lastTxn ? <strong>{longBs(adToBs(lastTxn))}</strong> : <span className="muted">none yet</span>}
          </div>
          <div>
            <span className="muted">Last opened: </span>
            {lastOpened ? bsDateTime(lastOpened) : <span className="muted">first visit on this device</span>}
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="tiles">
        <div className="tile"><div className="muted small">Cash in hand</div><div className="v">{money(cash)}</div></div>
        <div className="tile"><div className="muted small">Bank accounts</div><div className="v">{money(bank)}</div></div>
        <div className="tile"><div className="muted small">Sundry debtors</div><div className="v">{money(debtors)}</div></div>
        <div className="tile"><div className="muted small">Sundry creditors</div><div className="v">{money(creditors)}</div></div>
        <div className="tile">
          <div className="muted small">Profit this year (from {longBs(fyFromB)})</div>
          <div className="v" style={{ color: profit >= 0 ? 'var(--accent)' : 'var(--cr)' }}>{money(profit)}</div>
        </div>
      </div>

      <h2>Recent vouchers</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>No.</th><th>Type</th><th>Particulars</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {recent.map((v) => (
              <tr key={v.id} style={v.is_cancelled ? { textDecoration: 'line-through', opacity: .6 } : null}>
                <td><BsDate ad={v.date} /></td>
                <td><Link to={`/voucher/${v.id}`}>{v.voucher_no}</Link></td>
                <td>{v.voucher_type}</td>
                <td className="small">
                  <span className="dr">Dr</span> {v.debit_ledgers} <span className="muted">/</span>{' '}
                  <span className="cr">Cr</span> {v.credit_ledgers}
                </td>
                <td className="num">{money(v.amount)}</td>
              </tr>
            ))}
            {!recent.length && <tr><td colSpan={5} className="muted">No vouchers yet. Start with New Voucher.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
