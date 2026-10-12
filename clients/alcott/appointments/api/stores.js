import { handler } from '../lib/http.js';
import { listStores } from '../lib/booking.js';

// GET /api/stores → [{ code, name, city }]
export default handler(['GET'], async (req, res) => {
  res.status(200).json({ ok: true, stores: await listStores() });
});
