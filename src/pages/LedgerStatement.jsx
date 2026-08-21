import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money, drcr, today, fyStart } from '../lib/api'

export default function LedgerStatement() {
  const [ledgers, setLedgers] = useState([])
  const [ledgerId, setLedgerId] = useState('')
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => { api.ledgerList().then(setLedgers).catch((e) => setErr(e.message)) }, [])

  function load() {
    if (!ledgerId) return
    api.ledgerStatement(ledgerId, from, to).then(setRows).catch((e) => setErr(e.message))
  }
  useEffect(load, [ledgerId])

  const txns = rows.filter((r) => r.seq === 1)
  const totDr = txns.reduce((s, r) => s + Number(r.debit || 0), 0)
  const totCr = txns.reduce((s, r) => s + Number(r.credit || 0), 0)
  const closing = rows.length ? drcr(rows[rows.length - 1].running) : null
  const name = ledgers.find((l) => l.id === ledgerId)?.name

  return (
    <>
      <h1>Ledger Statement</h1>
      <p className="sub">{name || 'Pick a ledger to see its account.'}</p>
      {err && <div className="err">{err}</div>}

      <div className="toolbar">
        <div className="field" style={{ minWidth: 240 }}>
          <label>Ledger</label>
          <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)}>
            <option value="">— select —</option>
            {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="field"><label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="primary" onClick={load}>Show</button>
        <button className="ghost" onClick={() => window.print()}>Print</button>
      </div>

      {!!rows.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>No.</th><th>Type</th><th>Particulars</th>
                <th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const b = drcr(r.running)
                return (
                  <tr key={i}>
                    <td>{r.vdate || ''}</td>
                    <td>{r.voucher_id ? <Link to={`/voucher/${r.voucher_id}`}>{r.voucher_no}</Link> : <em>{r.voucher_no}</em>}</td>
                    <td>{r.voucher_type}</td>
                    <td className="small">{r.particulars}{r.narration ? <div className="muted">{r.narration}</div> : null}</td>
                    <td className="num">{Number(r.debit) ? money(r.debit) : ''}</td>
                    <td className="num">{Number(r.credit) ? money(r.credit) : ''}</td>
                    <td className="num">{money(b.amount)} <span className={b.side === 'Dr' ? 'dr' : 'cr'}>{b.side}</span></td>
                  </tr>
                )
              })}
              <tr className="total">
                <td colSpan={4}>Period total</td>
                <td className="num">{money(totDr)}</td>
                <td className="num">{money(totCr)}</td>
                <td className="num">
                  {closing && <>{money(closing.amount)} <span className={closing.side === 'Dr' ? 'dr' : 'cr'}>{closing.side}</span></>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
