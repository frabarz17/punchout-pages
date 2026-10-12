import { handler, HttpError } from '../lib/http.js';
import { getStore, listAppointments } from '../lib/booking.js';
import { isDate, todayIn } from '../lib/time.js';

// GET /api/appointments?store=alcott-milano[&date=YYYY-MM-DD] → array (same shape the dashboard already uses)
export default handler(['GET'], async (req, res) => {
  const { store: code, date } = req.query;
  if (!code) throw new HttpError(400, 'Parametro store mancante.');
  const store = await getStore(code);
  const day = isDate(date) ? date : todayIn(store.tz);
  res.status(200).json(await listAppointments(store, day));
});
