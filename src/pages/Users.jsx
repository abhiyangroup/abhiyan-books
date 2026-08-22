import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Users() {
  const [rows, setRows] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('accountant')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  function load() {
    api.users().then(setRows).catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  async function apply(e) {
    e.preventDefault()
    setErr(''); setOk('')
    try {
      const msg = await api.setUserRole(email.trim(), role)
      setOk(msg); setEmail(''); load()
    } catch (e2) { setErr(e2.message) }
  }

  return (
    <>
      <h1>Users</h1>
      <p className="sub">
        Accounts are created in Supabase → Authentication → Users. Set what each one may do here.
      </p>
      {err && <div className="err">{err}</div>}
      {ok && <div className="ok">{ok}</div>}

      <form className="card" onSubmit={apply}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="person@example.com" required />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">admin — everything</option>
              <option value="accountant">accountant — post and edit vouchers</option>
              <option value="viewer">viewer — read reports only</option>
            </select>
          </div>
          <button className="primary">Set role</button>
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Last signed in</th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td className="small">{u.email}</td>
                <td className="small"><strong>{u.role}</strong></td>
                <td className="small muted">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'never'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={4} className="muted">
                No users visible — only an admin can see this list.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
