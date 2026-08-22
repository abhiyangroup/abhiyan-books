import { useEffect, useMemo, useState } from 'react'
import { api, money } from '../lib/api'

const empty = {
  name: '', group_id: '', opening_balance: 0, opening_type: 'Dr',
  alias: '', pan_vat: '', phone: '', address: '',
}

export default function Ledgers() {
  const [rows, setRows] = useState([])
  const [groups, setGroups] = useState([])
  const [q, setQ] = useState('')
  const [onlyUnset, setOnlyUnset] = useState(false)
  const [editing, setEditing] = useState(null)   // null | 'new' | ledger object
  const [form, setForm] = useState(empty)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  function load() {
    Promise.all([api.ledgers(), api.groupsFlat()])
      .then(([l, g]) => { setRows(l); setGroups(g) })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (onlyUnset && Number(r.opening_balance)) return false
      if (!s) return true
      return r.name.toLowerCase().includes(s) ||
             (r.group_name || '').toLowerCase().includes(s) ||
             (r.primary_group || '').toLowerCase().includes(s)
    })
  }, [rows, q, onlyUnset])

  // how far through the opening-balance entry you are
  const withOpening = rows.filter((r) => Number(r.opening_balance)).length
  const openDr = rows.reduce((s, r) => s + (r.opening_type === 'Dr' ? Number(r.opening_balance) : 0), 0)
  const openCr = rows.reduce((s, r) => s + (r.opening_type === 'Cr' ? Number(r.opening_balance) : 0), 0)

  function startNew() { setEditing('new'); setForm(empty); setOk(''); setErr('') }

  function startEdit(r) {
    setEditing(r)
    setForm({
      name: r.name,
      group_id: r.group_id,
      opening_balance: r.opening_balance,
      opening_type: r.opening_type,
      alias: r.alias || '',
      pan_vat: r.pan_vat || '',
      phone: r.phone || '',
      address: r.address || '',
    })
    setOk(''); setErr('')
  }

  async function save(e) {
    e.preventDefault()
    setErr(''); setOk('')
    const payload = {
      name: form.name.trim(),
      group_id: form.group_id,
      opening_balance: parseFloat(form.opening_balance) || 0,
      opening_type: form.opening_type,
      alias: form.alias.trim() || null,
      pan_vat: form.pan_vat.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    }
    try {
      if (editing === 'new') await api.createLedger(payload)
      else await api.updateLedger(editing.id, payload)
      setOk(`Saved ${payload.name}.`); setEditing(null); load()
    } catch (e2) { setErr(e2.message) }
  }

  async function remove(r) {
    if (!confirm(`Delete ledger "${r.name}"? This fails if it has vouchers.`)) return
    try { await api.deleteLedger(r.id); load() } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <h1>Ledgers</h1>
      <p className="sub">
        {rows.length} accounts imported from Tally · {withOpening} have an opening balance ·
        opening totals {money(openDr)} Dr / {money(openCr)} Cr
        {Math.abs(openDr - openCr) > 0.005 &&
          <span className="cr"> · out by {money(Math.abs(openDr - openCr))}</span>}
      </p>
      {err && <div className="err">{err}</div>}
      {ok && <div className="ok">{ok}</div>}

      <div className="toolbar">
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ledger or group name" />
        </div>
        <label className="small" style={{ alignSelf: 'center' }}>
          <input type="checkbox" checked={onlyUnset} onChange={(e) => setOnlyUnset(e.target.checked)} />
          {' '}only accounts still at zero
        </label>
        <button className="primary" onClick={startNew}>+ New ledger</button>
      </div>

      {editing && (
        <form className="card" onSubmit={save}>
          <h2 style={{ marginTop: 0 }}>{editing === 'new' ? 'New ledger' : `Edit: ${editing.name}`}</h2>
          <div className="toolbar">
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label>Under group</label>
              <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} required>
                <option value="">— select —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Opening balance</label>
              <input type="number" step="0.01" min="0" value={form.opening_balance}
                     onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} style={{ width: 140 }} />
            </div>
            <div className="field">
              <label>Dr / Cr</label>
              <select value={form.opening_type} onChange={(e) => setForm({ ...form, opening_type: e.target.value })}>
                <option>Dr</option><option>Cr</option>
              </select>
            </div>
          </div>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <div className="field"><label>Alias</label>
              <input value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} style={{ width: 130 }} /></div>
            <div className="field"><label>PAN / VAT</label>
              <input value={form.pan_vat} onChange={(e) => setForm({ ...form, pan_vat: e.target.value })} style={{ width: 130 }} /></div>
            <div className="field"><label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ width: 130 }} /></div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}><label>Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <button className="primary">Save</button>
            <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ledger</th><th>Under</th><th>Primary group</th>
              <th className="num">Opening</th><th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.name}{r.alias && <span className="muted small"> ({r.alias})</span>}</td>
                <td className="small">{r.group_name}</td>
                <td className="small muted">{r.primary_group}</td>
                <td className="num">
                  {Number(r.opening_balance)
                    ? <>{money(r.opening_balance)} <span className={r.opening_type === 'Dr' ? 'dr' : 'cr'}>{r.opening_type}</span></>
                    : '—'}
                </td>
                <td>
                  <button className="link" onClick={() => startEdit(r)}>edit</button>{' · '}
                  <button className="link" onClick={() => remove(r)}>delete</button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="muted">Nothing matches that search.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
