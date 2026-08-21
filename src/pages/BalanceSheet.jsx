import { useEffect, useState } from 'react'
import { api, money, today } from '../lib/api'

function Side({ title, rows }) {
  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  let lastGroup = null
  return (
    <div className="table-wrap" style={{ flex: 1, minWidth: 300 }}>
      <table>
        <thead><tr><th>{title}</th><th className="num" style={{ width: 150 }}>Amount</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const head = r.group_name !== lastGroup ? (lastGroup = r.group_name) : null
            return [
              head && <tr className="group-row" key={'g' + i}><td colSpan={2}>{r.group_name}</td></tr>,
              <tr key={i}>
                <td style={{ paddingLeft: 22 }}>{r.ledger_name}</td>
                <td className="num">{money(r.amount)}</td>
              </tr>,
            ]
          })}
          {!rows.length && <tr><td colSpan={2} className="muted">Nothing to show.</td></tr>}
          <tr className="total"><td>Total</td><td className="num">{money(total)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export default function BalanceSheet() {
  const [asOn, setAsOn] = useState(today())
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  function load() { api.balanceSheet(asOn).then(setRows).catch((e) => setErr(e.message)) }
  useEffect(load, [])

  const assets = rows.filter((r) => r.side === 'assets')
  const liabs = rows.filter((r) => r.side === 'liabilities')
  const diff = assets.reduce((s, r) => s + Number(r.amount), 0) -
               liabs.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <>
      <h1>Balance Sheet</h1>
      <p className="sub">As on {asOn}</p>
      {err && <div className="err">{err}</div>}

      <div className="toolbar">
        <div className="field"><label>As on</label>
          <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} /></div>
        <button className="primary" onClick={load}>Show</button>
        <button className="ghost" onClick={() => window.print()}>Print</button>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Side title="Liabilities &amp; Capital" rows={liabs} />
        <Side title="Assets" rows={assets} />
      </div>

      {Math.abs(diff) > 0.005 && (
        <p className="err" style={{ marginTop: 12 }}>
          Difference of {money(Math.abs(diff))} — usually an opening balance that has not been entered yet.
        </p>
      )}
    </>
  )
}
