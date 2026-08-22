import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { supabase, api } from './lib/api'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import Ledgers from './pages/Ledgers'
import DayBook from './pages/DayBook'
import VoucherForm from './pages/VoucherForm'
import LedgerStatement from './pages/LedgerStatement'
import TrialBalance from './pages/TrialBalance'
import ProfitLoss from './pages/ProfitLoss'
import BalanceSheet from './pages/BalanceSheet'

const NAV = [
  ['/', 'Dashboard'],
  ['/voucher', 'New Voucher'],
  ['/daybook', 'Day Book'],
  ['/statement', 'Ledger Statement'],
  ['/trial-balance', 'Trial Balance'],
  ['/profit-loss', 'Profit & Loss'],
  ['/balance-sheet', 'Balance Sheet'],
  ['/ledgers', 'Ledgers'],
  ['/groups', 'Groups'],
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) api.myProfile().then(setProfile).catch(() => setProfile(null))
    else setProfile(null)
  }, [session])

  if (session === undefined) return <div className="center">Loading…</div>
  if (!session) return <Login />

  return (
    <HashRouter>
      <div className="app">
        <header className="topbar">
          <button className="burger" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <div className="brand">
            <strong>Abhiyan Group PVT LTD</strong>
            <span className="muted"> · Books</span>
          </div>
          <div className="topbar-right">
            <span className="muted small">
              {profile?.full_name || session.user.email} ({profile?.role || '…'})
            </span>
            <button className="link" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </header>

        <div className="body">
          <nav className={menuOpen ? 'sidebar open' : 'sidebar'}>
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => (isActive ? 'nav active' : 'nav')}
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <main className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/voucher" element={<VoucherForm />} />
              <Route path="/voucher/:id" element={<VoucherForm />} />
              <Route path="/daybook" element={<DayBook />} />
              <Route path="/statement" element={<LedgerStatement />} />
              <Route path="/trial-balance" element={<TrialBalance />} />
              <Route path="/profit-loss" element={<ProfitLoss />} />
              <Route path="/balance-sheet" element={<BalanceSheet />} />
              <Route path="/ledgers" element={<Ledgers />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  )
}
