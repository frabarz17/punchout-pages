import { handler, body, HttpError } from '../lib/http.js';
import { findOrCreateCustomer } from '../lib/booking.js';

// POST /api/sf-customer { email, first_name, last_name, name } → { ok, id, created }
// Fallback used by the dashboard when an appointment has no Account linked.
export default handler(['POST'], async (req, res) => {
  const b = body(req);
  const email = String(b.email || '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'Email mancante.');
  let { first_name = '', last_name = '' } = b;
  if (!last_name && b.name) { const p = String(b.name).trim().split(/\s+/); last_name = p.pop(); first_name = first_name || p.join(' '); }
  const c = await findOrCreateCustomer({ email, first_name, last_name: last_name || email.split('@')[0] });
  res.status(200).json({ ok: true, id: c.Id, created: c.created });
});
