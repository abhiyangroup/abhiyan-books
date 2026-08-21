// Supabase connection for Abhiyan Group PVT LTD.
//
// These are PUBLISHABLE keys. They are designed to sit in the browser and are
// safe to commit — Row Level Security in the database decides what anyone can
// actually read or write. Never put a `service_role` or `sb_secret_...` key here.
//
// Values in .env (locally) or GitHub Actions secrets (on deploy) override these.

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ghlwrvjgmrwubcjpntmr.supabase.co'

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdobHdydmpnbXJ3dWJjanBudG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMjUzNTMsImV4cCI6MjEwMjkwMTM1M30.QHfNptaGlYlyhNSd1MquyEZ69HFSFFr32mW3lgrLP3w'

// The newer publishable key for the same project, kept for reference:
// sb_publishable_0NlUXwSp5_bcqq0YedJpuQ_Ap6fMZxo
