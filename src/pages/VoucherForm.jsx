import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, money, today } from '../lib/api'

const blank = () => ({ ledger_id: '', debit: '', credit: '', line_narration: '' })

export default function VoucherForm() {
  const { id } = useParams()
  const nav = useNavigate()

  const [types, setTypes] = useState([])
  const [ledgers, setLedgers] = useState([])
  const [typeId, setTypeId] = useState('')
  const [date, setDate] = useState(today())
  const [nepaliDate, setNepaliDate] = useState('')
  const [voucherNo, setVoucherNo] = useState('')
  const [reference, setReference] = useState('')
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState([blank(), blank()])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.voucherTypes(), api.ledgerList()])
      .then(([t, l]) => {
        setTypes(t)
        setLedgers(l)
        if (!id && t.length) setTypeId(t[0].id)
      })
      .catch((e) => setErr(e.message))
  }, [id])

  // load an existing voucher for editing
  useEffect(() => {
    if (!id) return
    api.voucher(id)
      .then((v) => {
        setTypeId(v.voucher_type_id)
        setDate(v.date)
        setNepaliDate(v.nepali_date || '')
        setVoucherNo(v.voucher_no)
        setReference(v.reference || '')
        setNarration(v.narration || '')
        setLines(
          v.lines.map((l) => ({
            ledger_id: l.ledger_id,
            debit: Number(l.debit) ? String(l.debit) : '',
            credit: Number(l.credit) ? String(l.credit) : '',
            line_narration: l.line_narration || '',
          }))
        )
      })
      .catch((e) => setErr(e.message))
  }, [id])

  // suggest the next voucher number for a new voucher
  useEffect(() => {
    if (id || !typeId) return
    api.nextVoucherNo(typeId).then(setVoucherNo).catch(() => {})
  }, [typeId, id])

  const totals = useMemo(() => {
    const dr = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
    const cr = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
    return { dr, cr, diff: +(dr - cr).toFixed(2) }
  }, [lines])

  function setLine(i, patch) {
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  }

  async function save(e) {
    e.preventDefault()
    setErr(''); setOk('')

    const entries = lines
      .filter((l) => l.ledger_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
      .map((l) => ({
        ledger_id: l.ledger_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        line_narration: l.line_narration || null,
      }))

    if (entries.length < 2) return setErr('A voucher needs at least one debit and one credit line.')
    if (totals.diff !== 0) return setErr(`Voucher is out of balance by ${money(Math.abs(totals.diff))}.`)

    setBusy(true)
    try {
      const newId = await api.saveVoucher({
        id, typeId, date, entries, narration, reference, nepaliDate, voucherNo,
      })
      setOk(`Saved ${voucherNo}.`)
      if (!id) {
        setLines([blank(), blank()])
        setNarration(''); setReference('')
        api.nextVoucherNo(typeId).then(setVoucherNo).catch(() => {})
      } else {
        nav(`/voucher/${newId}`)
      }
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !confirm('Delete this voucher permanently?')) return
    try { await api.deleteVoucher(id); nav('/daybook') } catch (e) { setErr(e.message) }
  }

  return (
    <form onSubmit={save}>
      <h1>{id ? `Edit voucher ${voucherNo}` : 'New voucher'}</h1>
      <p className="sub">Debits must equal credits before the voucher can be saved.</p>

      {err && <div className="err">{err}</div>}
      {ok && <div className="ok">{ok}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="field">
            <label>Voucher type</label>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Voucher no.</label>
            <input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} style={{ width: 120 }} />
          </div>
          <div className="field">
            <label>Date (AD)</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Date (BS)</label>
            <input value={nepaliDate} placeholder="2081-05-06"
                   onChange={(e) => setNepaliDate(e.target.value)} style={{ width: 110 }} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Reference</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '34%' }}>Ledger</th>
              <th>Line narration</th>
              <th className="num" style={{ width: 130 }}>Debit</th>
              <th className="num" style={{ width: 130 }}>Credit</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select value={l.ledger_id} onChange={(e) => setLine(i, { ledger_id: e.target.value })}
                          style={{ width: '100%' }}>
                    <option value="">— select ledger —</option>
                    {ledgers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </td>
                <td>
                  <input value={l.line_narration} style={{ width: '100%' }}
                         onChange={(e) => setLine(i, { line_narration: e.target.value })} />
                </td>
                <td className="num">
                  <input type="number" step="0.01" min="0" value={l.debit} style={{ width: '100%', textAlign: 'right' }}
                         onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })} />
                </td>
                <td className="num">
                  <input type="number" step="0.01" min="0" value={l.credit} style={{ width: '100%', textAlign: 'right' }}
                         onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })} />
                </td>
                <td>
                  <button type="button" className="link"
                          onClick={() => setLines(lines.filter((_, k) => k !== i))}
                          disabled={lines.length <= 2}>✕</button>
                </td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={2}>Total</td>
              <td className="num">{money(totals.dr)}</td>
              <td className="num">{money(totals.cr)}</td>
              <td></td>
            </tr>
            {totals.diff !== 0 && (
              <tr>
                <td colSpan={2} className="cr">Difference</td>
                <td className="num cr" colSpan={2}>{money(Math.abs(totals.diff))} {totals.diff > 0 ? 'Dr' : 'Cr'}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="toolbar" style={{ marginTop: 14 }}>
        <button type="button" className="ghost" onClick={() => setLines([...lines, blank()])}>+ Add line</button>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Narration</label>
          <input value={narration} onChange={(e) => setNarration(e.target.value)} />
        </div>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save voucher'}</button>
        {id && <button type="button" className="danger" onClick={remove}>Delete</button>}
      </div>
    </form>
  )
}
