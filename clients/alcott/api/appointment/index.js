import { handler, body, HttpError } from '../../lib/http.js';
import { getStore, getSlots, findOrCreateCustomer, createAppointment } from '../../lib/booking.js';
import { isDate, isTime, todayIn } from '../../lib/time.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/appointment → { ok, id: CODE, name, preferred_date, preferred_time, store_name }
export default handler(['POST'], async (req, res) => {
  const b = body(req);
  const first_name = String(b.first_name || '').trim().slice(0, 40);
  const last_name = String(b.last_name || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 80);
  const phone = String(b.phone || '').trim().slice(0, 40);
  const notes = String(b.notes || '').trim().slice(0, 1000);
  const date = b.preferred_date, time = b.preferred_time;

  if (!first_name || !last_name || !email) throw new HttpError(400, 'Nome, cognome ed email sono obbligatori.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Indirizzo email non valido.');
  if (!isDate(date) || !isTime(time)) throw new HttpError(400, 'Scegli data e orario.');

  const store = await getStore(b.store);
  if (date < todayIn(store.tz)) throw new HttpError(400, 'La data scelta è già passata.');
  const { closed, slots } = await getSlots(store, date);
  if (closed) throw new HttpError(409, 'Il negozio è chiuso nel giorno scelto.');
  const slot = slots.find((s) => s.time === time);
  if (!slot) throw new HttpError(409, 'Orario non disponibile per questo negozio.');
  if (!slot.available) throw new HttpError(409, 'Orario appena esaurito, scegline un altro.');

  const customer = await findOrCreateCustomer({ email, first_name, last_name, phone });
  const appt = await createAppointment({ store, customer, date, time, email, phone, notes });

  res.status(200).json({
    ok: true, id: appt.code, name: `${first_name} ${last_name}`.trim(),
    preferred_date: date, preferred_time: time, store_name: store.name, store_code: store.code,
  });
});
