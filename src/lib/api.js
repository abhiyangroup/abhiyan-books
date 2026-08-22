import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

// persistSession:false keeps the session in memory only. Closing or
// reloading the tab drops it, so the password is required again -- nothing
// is left behind in the browser on a shared machine.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// ---------------------------------------------------------------- helpers

export function money(n) {
  const v = Number(n || 0)
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// signed amount -> { amount, side }
export function drcr(signed) {
  const v = Number(signed || 0)
  return { amount: Math.abs(v), side: v >= 0 ? 'Dr' : 'Cr' }
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function fyStart() {
  return '2023-07-17'
}

async function run(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------- masters

export const api = {
  groups: () =>
    run(supabase.from('v_group_tree').select('*').order('root_name').order('depth').order('name')),

  groupsFlat: () =>
    run(supabase.from('account_groups').select('id,name,nature,parent_id,is_primary').order('name')),

  createGroup: (g) => run(supabase.from('account_groups').insert(g).select().single()),
  updateGroup: (id, g) => run(supabase.from('account_groups').update(g).eq('id', id).select().single()),
  deleteGroup: (id) => run(supabase.from('account_groups').delete().eq('id', id)),

  ledgers: () =>
    run(supabase.from('v_ledgers_full').select('*').order('group_name').order('name')),

  ledgerList: () =>
    run(supabase.from('ledgers').select('id,name,group_id').eq('is_active', true).order('name')),

  createLedger: (l) => run(supabase.from('ledgers').insert(l).select().single()),
  updateLedger: (id, l) => run(supabase.from('ledgers').update(l).eq('id', id).select().single()),
  deleteLedger: (id) => run(supabase.from('ledgers').delete().eq('id', id)),

  balances: () => run(supabase.from('v_ledger_balances').select('*').order('name')),

  // -------------------------------------------------------------- vouchers

  voucherTypes: () =>
    run(supabase.from('voucher_types').select('*').eq('is_active', true).order('sort_order')),

  daybook: (from, to) => {
    let q = supabase.from('v_daybook').select('*').order('date', { ascending: false }).order('voucher_no')
    if (from) q = q.gte('date', from)
    if (to) q = q.lte('date', to)
    return run(q)
  },

  voucher: async (id) => {
    const v = await run(supabase.from('vouchers').select('*').eq('id', id).single())
    const lines = await run(
      supabase
        .from('voucher_entries')
        .select('id,ledger_id,debit,credit,line_narration,sort_order,ledgers(name)')
        .eq('voucher_id', id)
        .order('sort_order')
    )
    return { ...v, lines }
  },

  nextVoucherNo: (typeId) => run(supabase.rpc('next_voucher_no', { p_type_id: typeId })),

  saveVoucher: (p) =>
    run(
      supabase.rpc('save_voucher', {
        p_type_id: p.typeId,
        p_date: p.date,
        p_entries: p.entries,
        p_narration: p.narration || null,
        p_reference: p.reference || null,
        p_nepali_date: p.nepaliDate || null,
        p_voucher_no: p.voucherNo || null,
        p_id: p.id || null,
      })
    ),

  deleteVoucher: (id) => run(supabase.from('vouchers').delete().eq('id', id)),

  // -------------------------------------------------------------- reports

  trialBalance: (from, to) =>
    run(supabase.rpc('fn_trial_balance', { p_from: from || null, p_to: to || null })),

  ledgerStatement: (ledgerId, from, to) =>
    run(
      supabase.rpc('fn_ledger_statement', {
        p_ledger_id: ledgerId,
        p_from: from || null,
        p_to: to || null,
      })
    ),

  profitLoss: (from, to) =>
    run(supabase.rpc('fn_profit_loss', { p_from: from || null, p_to: to || null })),

  netProfit: (from, to) =>
    run(supabase.rpc('fn_net_profit', { p_from: from || null, p_to: to || null })),

  balanceSheet: (asOn) => run(supabase.rpc('fn_balance_sheet', { p_as_on: asOn || null })),

  // -------------------------------------------------------------- session

  myProfile: async () => {
    const { data: sess } = await supabase.auth.getUser()
    if (!sess?.user) return null
    return run(supabase.from('profiles').select('*').eq('id', sess.user.id).single())
  },

  // admin only -- RLS returns nothing for anyone else
  users: () => run(supabase.from('v_users').select('*').order('created_at')),

  setUserRole: (email, role) =>
    run(supabase.rpc('set_user_role', { p_email: email, p_role: role })),
}
