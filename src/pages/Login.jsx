import { useState } from 'react'
import { supabase } from '../lib/api'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name } },
        })
        if (error) throw error
        setMsg('Account created. If email confirmation is on, check your inbox, then sign in.')
        setMode('signin')
      }
    } catch (e2) {
      setErr(e2.message)
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
        {msg && <div className="ok">{msg}</div>}

        {mode === 'signup' && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 minLength={6} required />
        </div>

        <button className="primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <p className="small muted" style={{ textAlign: 'center', marginBottom: 0 }}>
          {mode === 'signin' ? 'First time here? ' : 'Already registered? '}
          <button type="button" className="link"
                  onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr('') }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
          The first account created becomes the admin.
        </p>
      </form>
    </div>
  )
}
