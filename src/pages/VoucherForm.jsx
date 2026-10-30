import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, money } from '../lib/api'
import NepaliDateInput, { adToBs, bsToAd, todayBs, daysInBsMonth } from '../components/NepaliDateInput'

/* ---------- account classification (from Tally groups) ---------- */
const grp = (l) => `${l?.group_name || ''} ${l?.primary_group || ''}`
const kindOf = (l) => {
  if (!l) return 'other'
  const g = grp(l)
  if (/cash/i.test(g)) return 'cash'
  if (/bank/i.test(g)) return 'bank'            // includes Bank OD
  if (/debtor|creditor|customer|supplier|party/i.test(g)) return 'party'
  return 'other'
}
const sameId = (a, b) => String(a) === String(b)
const inList = (list, id) => list.some((x) => sameId(x.id, id))

// ledgers for a kind; falls back gracefully if groups aren't recognised
function ledgersOfKind(ledgers, kind) {
  if (kind === 'party') {
    const p = ledgers.filter((l) => kindOf(l) === 'party')
    return p.length ? p : ledgers.filter((l) => !['cash', 'bank'].includes(kindOf(l)))
  }
  const k = ledgers.filter((l) => kindOf(l) === kind)
  return k.length ? k : ledgers
}
function lineOptions(ledgers, mode) {
  if (mode.lineKind) return ledgersOfKind(ledgers, mode.lineKind)
  const nonCash = ledgers.filter((l) => !['cash', 'bank'].includes(kindOf(l)))
  return nonCash.length ? nonCash : ledgers
}

/*
  head  = side of the main account; lines go to the opposite side.
  modes = the choice shown at the top (Cash / Bank / Credit …).
  Types not listed (Journal) use the Dr/Cr view.
*/
const RULES = [
  { match: 'payment', head: 'Cr', lineLabel: 'Paid to', modes: [
    { key: 'cash', label: 'Cash', headKind: 'cash', headLabel: 'Paid from cash' },
    { key: 'bank', label: 'Bank', headKind: 'bank', headLabel: 'Paid from bank' },
  ]},
  { match: 'receipt', head: 'Dr', lineLabel: 'Received from', modes: [
    { key: 'cash', label: 'Cash', headKind: 'cash', headLabel: 'Received in cash' },
    { key: 'bank', label: 'Bank', headKind: 'bank', headLabel: 'Received in bank' },
  ]},
  { match: 'contra', head: 'Cr', modes: [
    { key: 'deposit',  label: 'Cash → Bank', headKind: 'cash', headLabel: 'From cash', lineKind: 'bank', lineLabel: 'Deposited into bank' },
    { key: 'withdraw', label: 'Bank → Cash', headKind: 'bank', headLabel: 'From bank', lineKind: 'cash', lineLabel: 'Into cash' },
    { key: 'transfer', label: 'Bank → Bank', headKind: 'bank', headLabel: 'From bank', lineKind: 'bank', lineLabel: 'To bank' },
  ]},
  { match: 'credit note', head: 'Cr', lineLabel: 'Sales return / VAT', modes: [
    { key: 'credit', label: 'Adjust customer', headKind: 'party', headLabel: 'Customer' },
    { key: 'cash',   label: 'Cash refund',     headKind: 'cash',  headLabel: 'Refund from cash' },
    { key: 'bank',   label: 'Bank refund',     headKind: 'bank',  headLabel: 'Refund from bank' },
  ]},
  { match: 'debit note', head: 'Dr', lineLabel: 'Purchase return / VAT', modes: [
    { key: 'credit', label: 'Adjust supplier', headKind: 'party', headLabel: 'Supplier' },
    { key: 'cash',   label: 'Cash refund',     headKind: 'cash',  headLabel: 'Refund received in cash' },
    { key: 'bank',   label: 'Bank refund',     headKind: 'bank',  headLabel: 'Refund received in bank' },
  ]},
  { match: 'sales', head: 'Dr', lineLabel: 'Sales / VAT account', modes: [
    { key: 'cash',   label: 'Cash',      headKind: 'cash',  headLabel: 'Received in cash' },
    { key: 'bank',   label: 'Bank',      headKind: 'bank',  headLabel: 'Received in bank' },
    { key: 'credit', label: 'On credit', headKind: 'party', headLabel: 'Customer' },
  ]},
  { match: 'purchase', head: 'Cr', lineLabel: 'Purchase / VAT account', modes: [
    { key: 'cash',   label: 'Cash',      headKind: 'cash',  headLabel: 'Paid from cash' },
    { key: 'bank',   label: 'Bank',      headKind: 'bank',  headLabel: 'Paid from bank' },
    { key: 'credit', label: 'On credit', headKind: 'party', headLabel: 'Supplier' },
  ]},
]
const ruleFor = (type) =>
  type ? RULES.find((r) => type.name.toLowerCase().includes(r.match)) || null : null

/* ---------- Simple | Dr/Cr segmented switch ---------- */
const GREEN = 'var(--primary, #17532f)'
const seg = {
  wrap: {
    display: 'inline-flex', padding: 4, gap: 4, borderRadius: 999,
    background: '#eef2ef', border: '1px solid #dfe6e1',
  },
  btn: {
    border: 0, background: 'transparent', color: '#4b5563', cursor: 'pointer',
    padding: '8px 20px', borderRadius: 999, fontSize: 15, fontWeight: 500,
    transition: 'background .15s, color .15s, box-shadow .15s',
  },
  on: {
    background: GREEN, color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)',
  },
}

/* ---------- voucher numbering: PREFIX-001/81-82 ---------- */
// used only when a type has no numbered vouchers yet
const DEFAULT_PREFIX = {
  payment: 'PMT', receipt: 'RCT', contra: 'CNT', journal: 'JRN',
  sales: 'SAL', purchase: 'PUR', 'credit note': 'CRN', 'debit note': 'DBN',
}

// Nepali fiscal year (1 Shrawan – end of Asar) for a BS date
function fyOf(bs) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(bs || '')
  if (!m) return null
  const start = +m[2] >= 4 ? +m[1] : +m[1] - 1
  return {
    from: `${start}-04-01`,
    to: `${start + 1}-03-${daysInBsMonth(start + 1, 3)}`,
    suffix: `${String(start).slice(2)}-${String(start + 1).slice(2)}`,   // 81-82
  }
}

const NUM_RE = /^(.*?)[-\s]?(\d+)(?:\/(\d{2}-\d{2}))?$/   // PMT-001/81-82 | PUR-0001

async function nextFyNumber(type, fy) {
  // everything entered in that fiscal year (including cancelled vouchers)
  const rows = await api.daybook(bsToAd(fy.from), bsToAd(fy.to))
  const all = rows.filter((r) => r.voucher_type === type.name)

  let max = 0, prefix = ''
  for (const r of all) {
    const x = NUM_RE.exec(String(r.voucher_no || '').trim())
    if (!x) continue
    if (!prefix) prefix = x[1]
    if (!x[3] || x[3] === fy.suffix) max = Math.max(max, +x[2])
  }

  if (!prefix) {
    // no voucher of this type that year: reuse the prefix from any other year
    try {
      const any = await api.daybook('1943-04-14', '2100-12-31')
      const hit = any.filter((r) => r.voucher_type === type.name)
        .map((r) => NUM_RE.exec(String(r.voucher_no || '').trim())).find(Boolean)
      prefix = hit?.[1] || ''
    } catch { /* ignore */ }
  }
  if (!prefix) prefix = DEFAULT_PREFIX[type.name.toLowerCase()] || type.name.slice(0, 3).toUpperCase()

  return `${prefix}-${String(max + 1).padStart(3, '0')}/${fy.suffix}`
}

/* ---------- helpers ---------- */
const flip = (s) => (s === 'Dr' ? 'Cr' : 'Dr')
const amt = (v) => parseFloat(v) || 0
const newLine = (side = 'Dr', amount = '') => ({ ledger_id: '', side, amount, line_narration: '' })
const blankHead = () => ({ ledger_id: '', line_narration: '' })
const freshLines = (rule) => (rule ? [newLine()] : [newLine('Dr'), newLine('Cr')])
const isBlank = (ls) => ls.every((l) => !l.ledger_id && !amt(l.amount))

// keep current main account if allowed, else auto-pick when there's only one (e.g. single Cash ledger)
function pickHead(ledgers, mode, currentId) {
  const opts = ledgersOfKind(ledgers, mode.headKind)
  if (currentId && inList(opts, currentId)) return currentId
  return opts.length === 1 ? opts[0].id : ''
}

// Dr/Cr lines -> one main account + other lines
function fit(rule, ls) {
  if (!rule) return null
  const used = ls.filter((l) => l.ledger_id || amt(l.amount))
  const heads = used.filter((l) => l.side === rule.head)
  if (heads.length !== 1) return null
  const rest = used.filter((l) => l !== heads[0])
  return {
    head: { ledger_id: heads[0].ledger_id, line_narration: heads[0].line_narration },
    lines: rest.length ? rest : [newLine()],
  }
}

// which Cash/Bank/Credit option an existing entry belongs to
function inferMode(rule, ledgers, head, ls) {
  return rule.modes.find((m) =>
    inList(ledgersOfKind(ledgers, m.headKind), head.ledger_id) &&
    ls.every((l) => !l.ledger_id || inList(lineOptions(ledgers, m), l.ledger_id))
  ) || null
}

export default function VoucherForm() {
  const { id } = useParams()
  const nav = useNavigate()

  const [types, setTypes] = useState([])
  const [ledgers, setLedgers] = useState([])
  const [typeId, setTypeId] = useState('')
  const [modeKey, setModeKey] = useState('')
  // BS is the main date; AD is always derived from it
  const [nepaliDate, setNepaliDate] = useState(todayBs())
  const date = bsToAd(nepaliDate)
  const [voucherNo, setVoucherNo] = useState('')
  const [reference, setReference] = useState('')
  const [narration, setNarration] = useState('')
  const [head, setHead] = useState(blankHead())
  const [lines, setLines] = useState([newLine()])
  const [forceAdvanced, setForceAdvanced] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const type = types.find((t) => sameId(t.id, typeId))
  const rule = ruleFor(type)
  const simple = !!rule && !forceAdvanced
  const mode = rule ? rule.modes.find((m) => m.key === modeKey) || rule.modes[0] : null

  const headOpts = simple ? ledgersOfKind(ledgers, mode.headKind) : []
  const lineOpts = simple ? lineOptions(ledgers, mode) : ledgers

  /* load masters (+ voucher when editing) — api.ledgers() returns group_name / primary_group */
  useEffect(() => {
    Promise.all([api.voucherTypes(), api.ledgers(), id ? api.voucher(id) : null])
      .then(([t, l, v]) => {
        setTypes(t)
        setLedgers(l)

        if (!v) {
          if (!t.length) return
          const r = ruleFor(t[0])
          setTypeId(t[0].id)
          setLines(freshLines(r))
          if (r) {
            setModeKey(r.modes[0].key)
            setHead({ ...blankHead(), ledger_id: pickHead(l, r.modes[0], '') })
          }
          return
        }

        setTypeId(v.voucher_type_id)
        // derive BS from the stored AD date so the two can never disagree
        setNepaliDate(adToBs(v.date) || v.nepali_date || '')
        setVoucherNo(v.voucher_no)
        setReference(v.reference || '')
        setNarration(v.narration || '')

        const ls = v.lines.map((x) => ({
          ledger_id: x.ledger_id,
          side: Number(x.debit) > 0 ? 'Dr' : 'Cr',
          amount: String(Number(x.debit) || Number(x.credit) || ''),
          line_narration: x.line_narration || '',
        }))
        const r = ruleFor(t.find((x) => sameId(x.id, v.voucher_type_id)))
        const f = fit(r, ls)
        const m = f && inferMode(r, l, f.head, f.lines)
        if (m) { setModeKey(m.key); setHead(f.head); setLines(f.lines); setForceAdvanced(false) }
        else { setLines(ls); setForceAdvanced(!!r) }
      })
      .catch((e) => setErr(e.message))
  }, [id])

  // voucher no. = PREFIX-001/81-82, numbered separately per type and fiscal year
  const fy = fyOf(nepaliDate)
  const [numTick, setNumTick] = useState(0)
  useEffect(() => {
    if (id || !typeId || !fy || !types.length) return
    const t = types.find((x) => sameId(x.id, typeId))
    if (!t) return
    let alive = true
    nextFyNumber(t, fy).then((n) => { if (alive && n) setVoucherNo(n) }).catch(() => {})
    return () => { alive = false }
  }, [typeId, id, fy?.suffix, types, numTick])

  const totals = useMemo(() => {
    if (simple) {
      const t = lines.reduce((s, l) => s + amt(l.amount), 0)
      return { dr: t, cr: t, total: t, diff: 0 }
    }
    const dr = lines.reduce((s, l) => s + (l.side === 'Dr' ? amt(l.amount) : 0), 0)
    const cr = lines.reduce((s, l) => s + (l.side === 'Cr' ? amt(l.amount) : 0), 0)
    return { dr, cr, total: dr, diff: +(dr - cr).toFixed(2) }
  }, [lines, simple])

  const ledgerName = (lid) => ledgers.find((x) => sameId(x.id, lid))?.name || ''

  function setLine(i, patch) {
    setLines((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  }

  // switch Cash / Bank / Credit
  function applyMode(m, h = head, ls = lines) {
    const allowed = lineOptions(ledgers, m)
    setModeKey(m.key)
    setHead({ ...h, ledger_id: pickHead(ledgers, m, h.ledger_id) })
    setLines(ls.map((l) => (inList(allowed, l.ledger_id) ? l : { ...l, ledger_id: '' })))
    setForceAdvanced(false)
  }

  function toAdvancedLines() {
    return [
      { ...head, side: rule.head, amount: totals.total ? String(totals.total) : '' },
      ...lines.map((l) => ({ ...l, side: flip(rule.head) })),
    ]
  }

  function changeType(newId) {
    const newRule = ruleFor(types.find((t) => sameId(t.id, newId)))
    setErr('')
    setTypeId(newId)

    if (!newRule) {                       // -> Journal
      if (simple) setLines(toAdvancedLines())
      setForceAdvanced(false)
      return
    }
    if (simple) {                         // simple -> simple: keep entries, same option if it exists
      return applyMode(newRule.modes.find((m) => m.key === modeKey) || newRule.modes[0])
    }
    if (isBlank(lines)) return applyMode(newRule.modes[0], blankHead(), freshLines(newRule))
    const f = fit(newRule, lines)
    const m = f && inferMode(newRule, ledgers, f.head, f.lines)
    if (m) applyMode(m, f.head, f.lines)
    else setForceAdvanced(true)
  }

  function toggleView() {
    setErr('')
    if (simple) { setLines(toAdvancedLines()); setForceAdvanced(true); return }
    const f = fit(rule, lines)
    const m = f && inferMode(rule, ledgers, f.head, f.lines)
    if (!m) return setErr('This entry has more than one main account, so it can only be shown in Dr/Cr view.')
    applyMode(m, f.head, f.lines)
  }

  function addLine() {
    if (simple) return setLines([...lines, newLine()])
    const d = totals.diff
    setLines([...lines, d > 0 ? newLine('Cr', String(d)) : d < 0 ? newLine('Dr', String(-d)) : newLine('Dr')])
  }

  function buildEntries() {
    const bad = lines.findIndex((l) => !l.ledger_id && amt(l.amount) > 0)
    if (bad >= 0) throw new Error(`Line ${bad + 1} has an amount but no account.`)
    const filled = lines.filter((l) => l.ledger_id && amt(l.amount) > 0)

    if (simple) {
      if (!head.ledger_id) throw new Error(`Choose the "${mode.headLabel}" account.`)
      if (!filled.length) throw new Error('Add at least one line with an amount.')
      if (filled.some((l) => sameId(l.ledger_id, head.ledger_id)))
        throw new Error(`${ledgerName(head.ledger_id)} can't be on both sides.`)
      const total = filled.reduce((s, l) => s + amt(l.amount), 0)
      const headDr = rule.head === 'Dr'
      return [
        { ledger_id: head.ledger_id, debit: headDr ? total : 0, credit: headDr ? 0 : total,
          line_narration: head.line_narration || null },
        ...filled.map((l) => ({
          ledger_id: l.ledger_id,
          debit: headDr ? 0 : amt(l.amount),
          credit: headDr ? amt(l.amount) : 0,
          line_narration: l.line_narration || null,
        })),
      ]
    }

    const entries = filled.map((l) => ({
      ledger_id: l.ledger_id,
      debit: l.side === 'Dr' ? amt(l.amount) : 0,
      credit: l.side === 'Cr' ? amt(l.amount) : 0,
      line_narration: l.line_narration || null,
    }))
    if (!entries.some((e) => e.debit) || !entries.some((e) => e.credit))
      throw new Error('A voucher needs at least one debit and one credit line.')
    if (totals.diff !== 0) throw new Error(`Voucher is out of balance by ${money(Math.abs(totals.diff))}.`)
    return entries
  }

  async function save(e) {
    e.preventDefault()
    setErr(''); setOk('')
    if (!date) return setErr('Enter a valid Nepali date (YYYY-MM-DD).')
    let entries
    try { entries = buildEntries() } catch (x) { return setErr(x.message) }

    setBusy(true)
    try {
      const newId = await api.saveVoucher({
        id, typeId, date, entries, narration, reference, nepaliDate, voucherNo,
      })
      setOk(`Saved ${voucherNo}.`)
      if (!id) {
        // keep Cash/Bank choice and main account for the next entry
        setHead((h) => ({ ...h, line_narration: '' }))
        setLines(freshLines(simple ? rule : null))
        setNarration(''); setReference('')
        setNumTick((n) => n + 1)
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

  const ledgerSelect = (options, value, onChange) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }}>
      <option value="">— select account —</option>
      {options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  )

  return (
    <form onSubmit={save}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>{id ? `Edit voucher ${voucherNo}` : 'New voucher'}</h1>
          <p className="sub">
            {simple
              ? 'Choose how it was paid, then enter the amounts — debit and credit are handled for you.'
              : 'Choose Dr or Cr for each line. Debits must equal credits before saving.'}
          </p>
        </div>

        {rule && (
          <div style={{ textAlign: 'right' }}>
            <div className="small muted" style={{ marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              Entry view
            </div>
            <div role="tablist" style={seg.wrap}>
              <button type="button" role="tab" aria-selected={simple}
                      style={{ ...seg.btn, ...(simple ? seg.on : null) }}
                      onClick={() => !simple && toggleView()}>
                Simple
              </button>
              <button type="button" role="tab" aria-selected={!simple}
                      style={{ ...seg.btn, ...(!simple ? seg.on : null) }}
                      onClick={() => simple && toggleView()}>
                Dr / Cr
              </button>
            </div>
          </div>
        )}
      </div>

      {err && <div className="err">{err}</div>}
      {ok && <div className="ok">{ok}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="field">
            <label>Voucher type</label>
            <select value={typeId} onChange={(e) => changeType(e.target.value)} required>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Voucher no.</label>
            <input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} style={{ width: 120 }} />
          </div>
          <div className="field">
            <label>Date (BS)</label>
            <NepaliDateInput value={nepaliDate} onChange={(bs) => setNepaliDate(bs)} required />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Reference</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        {simple && (
          <div className="toolbar" style={{ marginBottom: 0, alignItems: 'flex-end' }}>
            <div className="field">
              <label>{rule.match === 'contra' ? 'Transfer' : 'Mode'}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {rule.modes.map((m) => (
                  <button key={m.key} type="button"
                          className={m.key === mode.key ? 'primary' : 'ghost'}
                          onClick={() => applyMode(m)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label>{mode.headLabel}</label>
              {ledgerSelect(headOpts, head.ledger_id, (v) => setHead({ ...head, ledger_id: v }))}
            </div>
            <div className="field">
              <label>Total</label>
              <div style={{ fontSize: 18, fontWeight: 600, padding: '4px 0' }}>{money(totals.total)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '34%' }}>{simple ? (mode.lineLabel || rule.lineLabel) : 'Account'}</th>
              <th>Line narration</th>
              {!simple && <th style={{ width: 80 }}>Dr / Cr</th>}
              <th className="num" style={{ width: 140 }}>Amount</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{ledgerSelect(lineOpts, l.ledger_id, (v) => setLine(i, { ledger_id: v }))}</td>
                <td>
                  <input value={l.line_narration} style={{ width: '100%' }}
                         onChange={(e) => setLine(i, { line_narration: e.target.value })} />
                </td>
                {!simple && (
                  <td>
                    <select value={l.side} onChange={(e) => setLine(i, { side: e.target.value })}
                            className={l.side === 'Dr' ? 'dr' : 'cr'}>
                      <option>Dr</option><option>Cr</option>
                    </select>
                  </td>
                )}
                <td className="num">
                  <input type="number" step="0.01" min="0" value={l.amount}
                         style={{ width: '100%', textAlign: 'right' }}
                         onChange={(e) => setLine(i, { amount: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="link"
                          onClick={() => setLines(lines.filter((_, k) => k !== i))}
                          disabled={lines.length <= (simple ? 1 : 2)}>✕</button>
                </td>
              </tr>
            ))}

            {simple ? (
              <tr className="total">
                <td colSpan={2}>Total</td>
                <td className="num">{money(totals.total)}</td>
                <td></td>
              </tr>
            ) : (
              <>
                <tr className="total">
                  <td colSpan={3}>Total</td>
                  <td className="num">
                    <span className="dr">{money(totals.dr)} Dr</span><br />
                    <span className="cr">{money(totals.cr)} Cr</span>
                  </td>
                  <td></td>
                </tr>
                {totals.diff !== 0 && (
                  <tr>
                    <td colSpan={3} className="cr">Difference</td>
                    <td className="num cr">{money(Math.abs(totals.diff))} {totals.diff > 0 ? 'Dr' : 'Cr'}</td>
                    <td></td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {simple && head.ledger_id && totals.total > 0 && (
        <p className="small muted" style={{ marginTop: 6 }}>
          Posts as: {ledgerName(head.ledger_id)} {rule.head} {money(totals.total)} ·{' '}
          {lines.filter((l) => l.ledger_id && amt(l.amount))
                .map((l) => `${ledgerName(l.ledger_id)} ${flip(rule.head)} ${money(amt(l.amount))}`)
                .join(' · ')}
        </p>
      )}

      <div className="toolbar" style={{ marginTop: 14 }}>
        <button type="button" className="ghost" onClick={addLine}>+ Add line</button>
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
