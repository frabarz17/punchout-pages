// Time-zone helpers without external dependencies (uses the IANA tz database built into Node).

function parts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'long' });
  return Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
}

function offsetMs(tz, date) {
  const p = parts(date, tz);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

// 'YYYY-MM-DD' + 'HH:MM' local in tz → Date (UTC instant). Handles DST.
export function localToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMs(tz, new Date(guess));
  const off2 = offsetMs(tz, new Date(t));
  if (guess - off2 !== t) t = guess - off2;
  return new Date(t);
}

// Date/ISO → { date: 'YYYY-MM-DD', time: 'HH:MM', weekday: 'Monday' } in tz
export function utcToLocal(value, tz) {
  const p = parts(new Date(value), tz);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday: p.weekday };
}

export const todayIn = (tz) => utcToLocal(new Date(), tz).date;

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const isTime = (s) => /^\d{2}:\d{2}$/.test(s || '');
