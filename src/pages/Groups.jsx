import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

const empty = { name: '', parent_id: '', nature: 'asset', is_trading: false }

export default function Groups() {
  const [tree, setTree] = useState([])
  const [flat, setFlat] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  function load() {
    Promise.all([api.groups(), api.groupsFlat()])
      .then(([t, f]) => { setTree(t); setFlat(f) })
      .catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  // A group may not sit under itself or under one of its own children —
  // that would create a loop the recursive report queries cannot escape.
  const parentOptions = useMemo(() => {
    if (!editId) return flat
    const banned = new Set([editId])
    let grew = true
    while (grew) {
      grew = false
      for (const g of flat) {
        if (g.parent_id && banned.has(g.parent_id) && !banned.has(g.id)) {
          banned.add(g.id); grew = true
        }
      }
    }
    return flat.filter((g) => !banned.has(g.id))
  }, [flat, editId])

  const editingGroup = tree.find((g) => g.id === editId)

  async function save(e) {
    e.preventDefault()
    setErr(''); setOk('')

    const payload = {
      name: form.name.trim(),
      parent_id: form.parent_id || null,
      nature: form.nature,
      is_trading: !!form.is_trading,
    }

    // Guard the 15 Tally primary groups: renaming or re-parenting them
    // breaks every report that rolls up to them.
    if (editingGroup?.is_primary &&
        (payload.name !== editingGroup.name || payload.parent_id !== null)) {
      return setErr(`"${editingGroup.name}" is a Tally primary group. You can change its nature, but not its name or its parent.`)
    }

    try {
      if (editId) await api.updateGroup(editId, payload)
      else await api.createGroup(payload)
      setOk('Saved.'); setForm(empty); setEditId(null); load()
    } catch (e2) { setErr(e2.message) }
  }

  async function remove(g) {
    if (!confirm(`Delete group "${g.name}"? This fails if any ledger or sub-group still sits under it.`)) return
    try { await api.deleteGroup(g.id); load() } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <h1>Account Groups</h1>
      <p className="sub">{tree.length} groups. Primary groups follow Tally and should not be deleted.</p>
      {err && <div className="err">{err}</div>}
      {ok && <div className="ok">{ok}</div>}

      <form className="card" onSubmit={save}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Group name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                   disabled={editingGroup?.is_primary} required />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Under</label>
            <select value={form.parent_id} disabled={editingGroup?.is_primary}
                    onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
              <option value="">— primary —</option>
              {parentOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Nature</label>
            <select value={form.nature} onChange={(e) => setForm({ ...form, nature: e.target.value })}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <label className="small" style={{ alignSelf: 'center' }}>
            <input type="checkbox" checked={form.is_trading}
                   onChange={(e) => setForm({ ...form, is_trading: e.target.checked })} /> counts in gross profit
          </label>
          <button className="primary">{editId ? 'Update group' : 'Add group'}</button>
          {editId && <button type="button" className="ghost"
                             onClick={() => { setEditId(null); setForm(empty); setErr('') }}>Cancel</button>}
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Group</th><th>Primary group</th><th>Nature</th><th>Gross profit</th><th style={{ width: 110 }}></th></tr>
          </thead>
          <tbody>
            {tree.map((g) => (
              <tr key={g.id}>
                <td style={{ paddingLeft: 10 + g.depth * 20 }}>
                  {g.name}{g.alias && <span className="muted small"> ({g.alias})</span>}
                  {g.is_primary && <span className="muted small"> · primary</span>}
                </td>
                <td className="small muted">{g.root_name}</td>
                <td className="small">{g.nature}</td>
                <td className="small">{g.is_trading ? 'yes' : ''}</td>
                <td>
                  <button className="link" onClick={() => {
                    setEditId(g.id); setErr(''); setOk('')
                    setForm({ name: g.name, parent_id: g.parent_id || '', nature: g.nature, is_trading: g.is_trading })
                  }}>edit</button>
                  {!g.is_primary && <>{' · '}<button className="link" onClick={() => remove(g)}>delete</button></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
