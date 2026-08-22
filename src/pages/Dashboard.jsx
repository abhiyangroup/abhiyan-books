import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money, today, fyStart } from '../lib/api'

export default function Dashboard() {
  const [tb, setTb] = useState([])
  const [profit, setProfit] = useState(0)
  const [recent, setRecent] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([api.trialBalance(null, null), api.netProfit(fyStart(), today()), api.daybook()])
      .then(([t, p, d]) => { setTb(t); setProfit(Number(p) || 0); setRecent(d.slice(0, 8)) })
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
      <h1>Dashboard</h1>
      <p className="sub">Position as on {today()}</p>
      {err && <div className="err">{err}</div>}

      <div className="tiles">
        <div className="tile"><div className="muted small">Cash in hand</div><div className="v">{money(cash)}</div></div>
        <div className="tile"><div className="muted small">Bank accounts</div><div className="v">{money(bank)}</div></div>
        <div className="tile"><div className="muted small">Sundry debtors</div><div className="v">{money(debtors)}</div></div>
        <div className="tile"><div className="muted small">Sundry creditors</div><div className="v">{money(creditors)}</div></div>
        <div className="tile">
          <div className="muted small">Profit this year</div>
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
              <tr key={v.id}>
                <td>{v.date}</td>
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
