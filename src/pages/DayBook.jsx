import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money } from '../lib/api'
import { downloadCsv, num, COMPANY } from '../lib/csv'
import NepaliDateInput, { BsDate, adToBs, bsToAd, todayBs, bsFyStart } from '../components/NepaliDateInput'

export default function DayBook() {
  // period is chosen in BS; the API still receives AD
  const [from, setFrom] = useState(bsFyStart())
  const [to, setTo] = useState(todayBs())
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  function load() {
    setErr('')
    api.daybook(bsToAd(from), bsToAd(to)).then(setRows).catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  const filtered = rows.filter((r) => {
    if (!q) return true
    const hay = [r.voucher_no, r.voucher_type, r.narration, r.reference, r.debit_ledgers, r.credit_ledgers]
      .join(' ').toLowerCase()
    return hay.includes(q.toLowerCase())
  })

  const total = filtered.reduce((s, r) => s + Number(r.amount || 0), 0)

  function exportCsv() {
    downloadCsv(
      'day-book',
      ['Date (BS)', 'Date (AD)', 'Voucher No', 'Type', 'Debit Ledgers',
       'Credit Ledgers', 'Reference', 'Narration', 'Amount', 'Cancelled'],
      filtered.map((r) => [
        adToBs(r.date), String(r.date).slice(0, 10), r.voucher_no, r.voucher_type,
        r.debit_ledgers, r.credit_ledgers, r.reference, r.narration,
        num(r.amount), r.is_cancelled ? 'yes' : '',
      ]),
      [COMPANY, 'Day Book', `Period: ${from} to ${to} (BS)`]
    )
  }

  return (
    <>
      <h1>Day Book</h1>
      <p className="sub">All vouchers from {from} to {to} (BS).</p>
      {err && <div className="err">{err}</div>}

      <div className="toolbar">
        <div className="field"><label>From (BS)</label>
          <NepaliDateInput value={from} onChange={setFrom} /></div>
        <div className="field"><label>To (BS)</label>
          <NepaliDateInput value={to} onChange={setTo} /></div>
        <button className="primary" onClick={load}>Show</button>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ledger, number, narration" />
        </div>
        <button className="ghost" onClick={exportCsv}>Export CSV</button>
        <Link to="/voucher"><button className="ghost">+ New voucher</button></Link>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>No.</th><th>Type</th>
              <th>Debit</th><th>Credit</th><th>Narration</th><th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={r.is_cancelled ? { textDecoration: 'line-through', opacity: .6 } : null}>
                <td><BsDate ad={r.date} /></td>
                <td><Link to={`/voucher/${r.id}`}>{r.voucher_no}</Link></td>
                <td>{r.voucher_type}</td>
                <td className="small dr">{r.debit_ledgers}</td>
                <td className="small cr">{r.credit_ledgers}</td>
                <td className="small muted">{r.narration}</td>
                <td className="num">{money(r.amount)}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="muted">No vouchers in this period.</td></tr>}
            {!!filtered.length && (
              <tr className="total"><td colSpan={6}>Total ({filtered.length} vouchers)</td>
                <td className="num">{money(total)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
