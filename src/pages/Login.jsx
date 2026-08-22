import { useState } from 'react'
import { supabase } from '../lib/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (e2) {
      setErr(
        /invalid login/i.test(e2.message)
          ? 'Wrong email or password.'
          : e2.message
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>Abhiyan Group PVT LTD</h1>
        <p className="sub" style={{ textAlign: 'center' }}>Accounting System</p>

        {err && <div className="err">{err}</div>}

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Email</label>
          <input type="email" value={email} autoComplete="username"
                 onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Password</label>
          <input type="password" value={password} autoComplete="current-password"
                 onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button className="primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="small muted" style={{ textAlign: 'center', margin: '12px 0 0' }}>
          Accounts are created by the administrator.
          <br />
          Contact them if you need access or a password reset.
        </p>
      </form>
    </div>
  )
}
