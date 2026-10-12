import { handler, HttpError } from '../lib/http.js';
import { getStore, getSlots } from '../lib/booking.js';
import { isDate, todayIn } from '../lib/time.js';

// GET /api/slots?store=alcott-milano&date=YYYY-MM-DD → { ok, closed, slots:[{time, available, remaining}] }
export default handler(['GET'], async (req, res) => {
  const { store: code, date } = req.query;
  if (!isDate(date)) throw new HttpError(400, 'Data non valida.');
  const store = await getStore(code);
  if (date < todayIn(store.tz)) return res.status(200).json({ ok: true, closed: false, slots: [], tz: store.tz });
  const r = await getSlots(store, date);
  res.status(200).json({ ok: true, ...r, tz: store.tz });
});
