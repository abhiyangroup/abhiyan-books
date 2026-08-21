import { useEffect, useState } from 'react'
import { api, money, today, fyStart } from '../lib/api'

function Section({ title, rows }) {
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  return (
    <>
      <tr className="group-row"><td colSpan={2}>{title}</td></tr>
      {rows.map((r, i) => (
        <tr key={i}>
          <td>{r.ledger_name} <span className="muted small">({r.group_name})</span></td>
          <td className="num">{money(r.amount)}</td>
        </tr>
      ))}
      <tr><td style={{ fontWeight: 600 }}>Total {title.toLowerCase()}</td>
        <td className="num" style={{ fontWeight: 600 }}>{money(total)}</td></tr>
    </>
  )
}

export default function ProfitLoss() {
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  function load() { api.profitLoss(from, to).then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [])

  const pick = (s) => rows.filter((r) => r.section === s)
  const sum = (s) => pick(s).reduce((a, r) => a + Number(r.amount), 0)

  const gross = sum('trading_income') - sum('trading_expense')
  const net = gross + sum('income') - sum('expense')

  return (
    <>
      <h1>Profit &amp; Loss Account</h1>
      <p className="sub">{from} to {to}</p>
      {err && <div className="err">{err}</div>}

      <div className="toolbar">
        <div className="field"><label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="primary" onClick={load}>Show</button>
        <button className="ghost" onClick={() => window.print()}>Print</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Particulars</th><th className="num" style={{ width: 180 }}>Amount</th></tr></thead>
          <tbody>
            <Section title="Sales &amp; direct income" rows={pick('trading_income')} />
            <Section title="Purchases &amp; direct expenses" rows={pick('trading_expense')} />
            <tr className="total"><td>Gross Profit</td><td className="num">{money(gross)}</td></tr>
            <Section title="Indirect income" rows={pick('income')} />
            <Section title="Indirect expenses" rows={pick('expense')} />
            <tr className="total">
              <td>{net >= 0 ? 'Net Profit' : 'Net Loss'}</td>
              <td className="num" style={{ color: net >= 0 ? 'var(--accent)' : 'var(--cr)' }}>{money(Math.abs(net))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
