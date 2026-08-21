import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money, today, fyStart } from '../lib/api'

export default function DayBook() {
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  function load() {
    api.daybook(from, to).then(setRows).catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  const filtered = rows.filter((r) => {
    if (!q) return true
    const hay = [r.voucher_no, r.voucher_type, r.narration, r.reference, r.debit_ledgers, r.credit_ledgers]
      .join(' ').toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <>
      <h1>Day Book</h1>
      <p className="sub">All vouchers in the selected period.</p>
      {err && <div className="err">{err}</div>}

      <div className="toolbar">
        <div className="field"><label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="primary" onClick={load}>Show</button>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ledger, number, narration" />
        </div>
        <Link to="/voucher"><button className="ghost">+ New voucher</button></Link>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>BS</th><th>No.</th><th>Type</th>
              <th>Debit</th><th>Credit</th><th>Narration</th><th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={r.is_cancelled ? { textDecoration: 'line-through', opacity: .6 } : null}>
                <td>{r.date}</td>
                <td className="small muted">{r.nepali_date}</td>
                <td><Link to={`/voucher/${r.id}`}>{r.voucher_no}</Link></td>
                <td>{r.voucher_type}</td>
                <td className="small dr">{r.debit_ledgers}</td>
                <td className="small cr">{r.credit_ledgers}</td>
                <td className="small muted">{r.narration}</td>
                <td className="num">{money(r.amount)}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={8} className="muted">No vouchers in this period.</td></tr>}
            {!!filtered.length && (
              <tr className="total"><td colSpan={7}>Total ({filtered.length} vouchers)</td>
                <td className="num">{money(total)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
