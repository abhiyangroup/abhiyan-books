/*
  README.md 
  Bikram Sambat (BS) <-> Gregorian (AD) conversion — exact, table based.

  Each row = one BS year, 12 digits = days in each month minus 28
  (Baisakh … Chaitra). Source: the published Nepali calendar, cross-checked
  day-by-day (31,777 days) against two independent converters and confirmed
  against Hamro Patro / published 2083 calendar (1 Kartik 2083 = 18 Oct 2026).

  BS 2000–2083: matches the officially published calendar.
  BS 2084–2086: projected — the official calendar for these years is not out
  yet. Re-check this table when each year's calendar is published
  (Nepal Panchanga Nirnayak Bikas Samiti).

  All maths is done in whole days on UTC dates, so timezones can't shift it.
  Dates are plain strings: 'YYYY-MM-DD'.
*/

export const MIN_BS_YEAR = 2000
export const MAX_BS_YEAR = 2086
export const CONFIRMED_UNTIL = 2083   // last BS year with an officially published calendar

const ROWS = [
'243432221213', // 2000
  '334333212122', // 2001
  '334432212122', // 2002
  '343432221123', // 2003
  '243432221213', // 2004
  '334333212122', // 2005
  '334432212122', // 2006
  '343432221123', // 2007
  '333433122113', // 2008
  '334333212122', // 2009
  '334432212122', // 2010
  '343432221123', // 2011
  '333433122122', // 2012
  '334333212122', // 2013
  '334432212122', // 2014
  '343432221123', // 2015
  '333433122122', // 2016
  '334333212122', // 2017
  '343432212122', // 2018
  '343432221213', // 2019
  '333433212122', // 2020
  '334333212122', // 2021
  '343432221122', // 2022
  '343432221213', // 2023
  '333433212122', // 2024
  '334333212122', // 2025
  '343432221123', // 2026
  '243432221213', // 2027
  '334333212122', // 2028
  '334342212122', // 2029
  '343432221123', // 2030
  '243432221213', // 2031
  '334333212122', // 2032
  '334432212122', // 2033
  '343432221123', // 2034
  '243433122113', // 2035
  '334333212122', // 2036
  '334432212122', // 2037
  '343432221123', // 2038
  '333433122122', // 2039
  '334333212122', // 2040
  '334432212122', // 2041
  '343432221123', // 2042
  '333433122122', // 2043
  '334333212122', // 2044
  '343432212122', // 2045
  '343432221123', // 2046
  '333433212122', // 2047
  '334333212122', // 2048
  '343432221122', // 2049
  '343432221213', // 2050
  '333433212122', // 2051
  '334333212122', // 2052
  '343432221122', // 2053
  '343432221213', // 2054
  '334333212122', // 2055
  '334342212122', // 2056
  '343432221123', // 2057
  '243432221213', // 2058
  '334333212122', // 2059
  '334432212122', // 2060
  '343432221123', // 2061
  '243433121213', // 2062
  '334333212122', // 2063
  '334432212122', // 2064
  '343432221123', // 2065
  '333433122113', // 2066
  '334333212122', // 2067
  '334432212122', // 2068
  '343432221123', // 2069
  '333433122122', // 2070
  '334333212122', // 2071
  '343432212122', // 2072
  '343432221123', // 2073
  '333433212122', // 2074
  '334333212122', // 2075
  '343432221122', // 2076
  '343432221213', // 2077
  '333433212122', // 2078
  '334333212122', // 2079
  '343432221122', // 2080
  '343432221213', // 2081
  '334333212122', // 2082
  '334333212122', // 2083
  '343432221123', // 2084
  '243432221213', // 2085
  '334333212122', // 2086
]

const MONTH_DAYS = ROWS.map((r) => [...r].map((c) => 28 + Number(c)))

// 1 Baisakh 2000 BS = 14 April 1943 AD
const ANCHOR_AD_UTC = Date.UTC(1943, 3, 14)
const DAY = 86400000

export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
]
export const BS_MONTHS_NP = [
  'बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज',
  'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत',
]
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n) => String(n).padStart(2, '0')

// cumulative day count at the start of each BS year
const YEAR_START = [0]
for (const m of MONTH_DAYS) YEAR_START.push(YEAR_START[YEAR_START.length - 1] + m.reduce((a, b) => a + b, 0))

export function daysInBsMonth(year, month /* 1-12 */) {
  const row = MONTH_DAYS[year - MIN_BS_YEAR]
  return row ? row[month - 1] : 0
}

/** '2083-07-10' | '2083/7/10' | '2083.7.10' -> { y, m, d } or null if not a real BS date */
export function parseBs(str) {
  const x = String(str || '').trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!x) return null
  const y = +x[1], m = +x[2], d = +x[3]
  if (y < MIN_BS_YEAR || y > MAX_BS_YEAR || m < 1 || m > 12) return null
  if (d < 1 || d > daysInBsMonth(y, m)) return null
  return { y, m, d }
}

export const isValidBs = (str) => !!parseBs(str)
export const fmtBs = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
export const isProvisionalBs = (str) => (parseBs(str)?.y || 0) > CONFIRMED_UNTIL

function bsDayNumber({ y, m, d }) {
  let n = YEAR_START[y - MIN_BS_YEAR]
  for (let i = 1; i < m; i++) n += daysInBsMonth(y, i)
  return n + d - 1
}

/** BS 'YYYY-MM-DD' -> AD 'YYYY-MM-DD' ('' if invalid) */
export function bsToAd(bs) {
  const p = parseBs(bs)
  if (!p) return ''
  const t = new Date(ANCHOR_AD_UTC + bsDayNumber(p) * DAY)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

function parseAd(ad) {
  const x = String(ad || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return x ? Date.UTC(+x[1], +x[2] - 1, +x[3]) : null
}

/** AD 'YYYY-MM-DD' (or ISO timestamp) -> BS 'YYYY-MM-DD' ('' if out of range) */
export function adToBs(ad) {
  const t = parseAd(ad)
  if (t == null) return ''
  let n = Math.round((t - ANCHOR_AD_UTC) / DAY)
  if (n < 0 || n >= YEAR_START[YEAR_START.length - 1]) return ''
  let yi = 0
  while (YEAR_START[yi + 1] <= n) yi++
  n -= YEAR_START[yi]
  const y = MIN_BS_YEAR + yi
  let m = 1
  while (n >= daysInBsMonth(y, m)) { n -= daysInBsMonth(y, m); m++ }
  return fmtBs(y, m, n + 1)
}

/** weekday 0=Sun … 6=Sat for a BS date */
export function bsWeekday(bs) {
  const t = parseAd(bsToAd(bs))
  return t == null ? null : new Date(t).getUTCDay()
}

/** today's date in BS, from the device's local calendar date */
export function todayBs() {
  const n = new Date()
  return adToBs(`${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`)
}

/** start of the Nepali fiscal year (1 Shrawan) that contains the given BS date */
export function bsFyStart(bs = todayBs()) {
  const p = parseBs(bs)
  if (!p) return ''
  return fmtBs(p.m >= 4 ? p.y : p.y - 1, 4, 1)
}

/** '10 Kartik 2083' */
export function longBs(bs) {
  const p = parseBs(bs)
  return p ? `${p.d} ${BS_MONTHS[p.m - 1]} ${p.y}` : ''
}

/** '27 Oct 2026 (Tue)' */
export function longAd(ad) {
  const t = parseAd(ad)
  if (t == null) return ''
  const d = new Date(t)
  return `${d.getUTCDate()} ${AD_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} (${WEEKDAYS[d.getUTCDay()]})`
}
