import { handler, HttpError } from '../lib/http.js';
import { getStore, listAppointments } from '../lib/booking.js';
import { isDate, todayIn } from '../lib/time.js';

// GET /api/appointments?store=alcott-milano[&date=YYYY-MM-DD][&days=7] → array
export default handler(['GET'], async (req, res) => {
  const { store: code, date, days } = req.query;
  if (!code) throw new HttpError(400, 'Parametro store mancante.');
  const store = await getStore(code);
  const day = isDate(date) ? date : todayIn(store.tz);
  const n = Math.min(Math.max(parseInt(days) || 1, 1), 30);
  res.status(200).json(await listAppointments(store, day, n));
});
