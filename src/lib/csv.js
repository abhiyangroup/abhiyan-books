// CSV export. Excel opens these directly -- double-click and it lands in a
// sheet with numbers as numbers, not text.

// Numbers go out unformatted (1234.50, not 1,234.50) so Excel can sum them.
export function num(n) {
  const v = Number(n || 0)
  return v === 0 ? '' : v.toFixed(2)
}

function cell(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // quote anything containing a comma, quote mark or line break
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

/**
 * downloadCsv('trial-balance', ['Ledger','Debit'], [['Cash','500.00']])
 * Optional `meta` lines print above the header -- company, period, etc.
 */
export function downloadCsv(filename, headers, rows, meta = []) {
  const lines = [
    ...meta.map((m) => cell(m)),
    ...(meta.length ? [''] : []),
    headers.map(cell).join(','),
    ...rows.map((r) => r.map(cell).join(',')),
  ]

  // The BOM tells Excel this is UTF-8, so Nepali names and the rupee
  // symbol survive instead of turning into mojibake.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${filename}-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
}

export const COMPANY = 'Abhiyan Group PVT LTD'
