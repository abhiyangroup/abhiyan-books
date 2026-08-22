import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money, drcr, today, fyStart } from '../lib/api'

export default function TrialBalance() {
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [hideZero, setHideZero] = useState(true)
  const [err, setErr] = useState('')

  function load() { api.trialBalance(from, to).then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [])

  const shown = rows.filter((r) => !hideZero ||
    Number(r.opening) || Number(r.debit) || Number(r.credit) || Number(r.closing))

  const t = shown.reduce((a, r) => {
    const c = Number(r.closing)
    a.debit += Number(r.debit); a.credit += Number(r.credit)
    if (c >= 0) a.closeDr += c; else a.closeCr += -c
    return a
  }, { debit: 0, credit: 0, closeDr: 0, closeCr: 0 })

  let lastGroup = null

  return (
    <>
      <h1>Trial Balance</h1>
      <p className="sub">{from} to {to}</p>
      {err && <div className="err">{err}</div>}

      <div className="toolbar">
        <div className="field"><label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="primary" onClick={load}>Show</button>
        <label className="small" style={{ alignSelf: 'center' }}>
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> hide nil accounts
        </label>
        <button className="ghost" onClick={() => window.print()}>Print</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ledger</th>
              <th className="num">Opening</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Closing</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const head = r.group_name !== lastGroup ? (lastGroup = r.group_name) : null
              const o = drcr(r.opening), c = drcr(r.closing)
              return [
                head && <tr className="group-row" key={'g' + r.ledger_id}>
                  <td colSpan={5}>{r.primary_group} › {r.group_name}</td></tr>,
                <tr key={r.ledger_id}>
                  <td><Link to={`/statement?ledger=${r.ledger_id}`}>{r.ledger_name}</Link></td>
                  <td className="num">{o.amount ? `${money(o.amount)} ${o.side}` : '—'}</td>
                  <td className="num">{Number(r.debit) ? money(r.debit) : ''}</td>
                  <td className="num">{Number(r.credit) ? money(r.credit) : ''}</td>
                  <td className="num">{c.amount ? <>{money(c.amount)} <span className={c.side === 'Dr' ? 'dr' : 'cr'}>{c.side}</span></> : '—'}</td>
                </tr>,
              ]
            })}
            <tr className="total">
              <td>Grand total</td>
              <td className="num"></td>
              <td className="num">{money(t.debit)}</td>
              <td className="num">{money(t.credit)}</td>
              <td className="num">{money(t.closeDr)} Dr / {money(t.closeCr)} Cr</td>
            </tr>
          </tbody>
        </table>
      </div>
      {Math.abs(t.closeDr - t.closeCr) > 0.005 && (
        <p className="err" style={{ marginTop: 12 }}>
          Closing balances differ by {money(Math.abs(t.closeDr - t.closeCr))} — check the opening balances on the Ledgers screen.
        </p>
      )}
    </>
  )
}
