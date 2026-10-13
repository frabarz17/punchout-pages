import { handler, HttpError } from '../../../lib/http.js';
import { getAppointmentByCode, getAppointmentById, updateAppointment, toDashboard } from '../../../lib/booking.js';

const SA_ID_RE = /^08p[a-zA-Z0-9]{12}([a-zA-Z0-9]{3})?$/;

// POST /api/appointment/{CODE}/checkin   (customer, from checkin.html)
// POST /api/appointment/{SA_ID}/accept   (operator: "Connetti al POS")
// POST /api/appointment/{SA_ID}/done     (operator: "Chiudi")
export default handler(['POST'], async (req, res) => {
  const { id, action } = req.query;

  if (action === 'checkin') {
    const code = String(id || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new HttpError(400, 'Inserisci il codice completo di 6 caratteri.');
    const r = await getAppointmentByCode(code);
    if (!r) throw new HttpError(404, 'Codice non trovato. Controlla e riprova.');
    const a = toDashboard(r);
    const tz = r.ServiceTerritory?.OperatingHours?.TimeZone || 'Europe/Rome';
    if (['Canceled', 'Cannot Complete'].includes(r.Status)) throw new HttpError(409, 'Questo appuntamento è stato annullato.');
    if (r.Status === 'Completed') throw new HttpError(409, 'Questo appuntamento è già concluso.');
    if (!r.Arrived_At__c) await updateAppointment(r.Id, { Arrived_At__c: new Date().toISOString() });
    return res.status(200).json({ ok: true, name: a.name, preferred_date: a.preferred_date,
      preferred_time: a.preferred_time, store_name: a.store_name });
  }

  if (action === 'accept' || action === 'done') {
    if (!SA_ID_RE.test(id || '')) throw new HttpError(400, 'Appuntamento non valido.');
    const r = await getAppointmentById(id);
    if (!r) throw new HttpError(404, 'Appuntamento non trovato.');
    const now = new Date().toISOString();
    const fields = action === 'accept'
      ? { Status: 'In Progress', ActualStartTime: now, ...(r.Arrived_At__c ? {} : { Arrived_At__c: now }) }
      : { Status: 'Completed', ActualEndTime: now };
    if (action === 'done' && r.Status === 'Scheduled') fields.ActualStartTime = now;
    await updateAppointment(id, fields);
    return res.status(200).json({ ok: true });
  }

  throw new HttpError(404, 'Azione non supportata.');
});
