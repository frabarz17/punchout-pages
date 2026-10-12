import crypto from 'node:crypto';
import { sf, query, q, SfError } from './sf.js';
import { HttpError } from './http.js';
import { localToUtc, utcToLocal, todayIn, weekdayOf, addDays, toMin, fromMin } from './time.js';

export const SLOT_MINUTES = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ── Stores ────────────────────────────────────────────────────────────────────
let storesCache = null; // { at, list }

export async function listStores() {
  if (storesCache && Date.now() - storesCache.at < 5 * 60 * 1000) return storesCache.list;
  const rows = await query(`SELECT Store_Code__c, Name, Description, City FROM ServiceTerritory
    WHERE Booking_Enabled__c = true AND IsActive = true AND Store_Code__c != null ORDER BY City, Name`);
  const list = rows.map((r) => ({ code: r.Store_Code__c, name: r.Description || r.Name, city: r.City || '' }));
  storesCache = { at: Date.now(), list };
  return list;
}

export async function getStore(code) {
  if (!/^[a-z0-9-]{2,80}$/i.test(code || '')) throw new HttpError(400, 'Seleziona un negozio valido.');
  const rows = await query(`SELECT Id, Name, Description, Store_Code__c, Slot_Capacity__c, OperatingHoursId,
    OperatingHours.TimeZone FROM ServiceTerritory
    WHERE Store_Code__c = ${q(code)} AND Booking_Enabled__c = true AND IsActive = true LIMIT 1`);
  if (!rows.length) throw new HttpError(404, 'Negozio non trovato o non prenotabile.');
  const r = rows[0];
  return { id: r.Id, code: r.Store_Code__c, name: r.Description || r.Name, capacity: r.Slot_Capacity__c || 2,
    operatingHoursId: r.OperatingHoursId, tz: r.OperatingHours?.TimeZone || 'Europe/Rome' };
}

// ── Slots ─────────────────────────────────────────────────────────────────────
export async function getSlots(store, date) {
  const ohs = await query(`SELECT (SELECT DayOfWeek, StartTime, EndTime FROM TimeSlots) FROM OperatingHours
    WHERE Id = ${q(store.operatingHoursId)}`);
  const day = weekdayOf(date);
  const windows = (ohs[0]?.TimeSlots?.records || []).filter((t) => t.DayOfWeek === day)
    .map((t) => [toMin(t.StartTime.slice(0, 5)), toMin(t.EndTime.slice(0, 5))]);
  if (!windows.length) return { closed: true, slots: [] };

  const start = localToUtc(date, '00:00', store.tz).toISOString();
  const end = localToUtc(addDays(date, 1), '00:00', store.tz).toISOString();
  const booked = await query(`SELECT SchedStartTime FROM ServiceAppointment
    WHERE ServiceTerritoryId = ${q(store.id)} AND SchedStartTime >= ${start} AND SchedStartTime < ${end}
    AND Status NOT IN ('Canceled', 'Cannot Complete')`);
  const count = {};
  for (const b of booked) { const t = utcToLocal(b.SchedStartTime, store.tz).time; count[t] = (count[t] || 0) + 1; }

  const isToday = date === todayIn(store.tz);
  const nowMin = isToday ? toMin(utcToLocal(new Date(), store.tz).time) : -1;
  const slots = [];
  for (const [a, b] of windows) {
    for (let m = a; m + SLOT_MINUTES <= b; m += SLOT_MINUTES) {
      const time = fromMin(m);
      if (m <= nowMin) continue;
      const used = count[time] || 0;
      slots.push({ time, available: used < store.capacity, remaining: Math.max(0, store.capacity - used) });
    }
  }
  return { closed: false, slots };
}

// ── Customers (Person Accounts) ───────────────────────────────────────────────
let personRtId = null;
async function personRecordTypeId() {
  if (personRtId) return personRtId;
  const r = await query(`SELECT Id FROM RecordType WHERE SobjectType = 'Account' AND DeveloperName = 'PersonAccount' AND IsActive = true LIMIT 1`);
  if (!r.length) throw new SfError('PersonAccount record type not found');
  return (personRtId = r[0].Id);
}

export async function findOrCreateCustomer({ email, first_name, last_name, phone }) {
  const found = await query(`SELECT Id, PersonContactId, FirstName, LastName, Name FROM Account
    WHERE IsPersonAccount = true AND PersonEmail = ${q(email)} ORDER BY CreatedDate ASC LIMIT 1`);
  if (found.length) return { ...found[0], created: false };
  if (!last_name) throw new HttpError(400, 'Cognome obbligatorio per creare il cliente.');
  const acc = { RecordTypeId: await personRecordTypeId(), FirstName: first_name || '', LastName: last_name, PersonEmail: email };
  if (phone) acc.PersonMobilePhone = phone;
  const { id } = await sf('POST', '/sobjects/Account', acc);
  const [row] = await query(`SELECT Id, PersonContactId, FirstName, LastName, Name FROM Account WHERE Id = ${q(id)}`);
  return { ...row, created: true };
}

// ── Appointments ──────────────────────────────────────────────────────────────
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

export async function createAppointment({ store, customer, date, time, email, phone, notes }) {
  const startDt = localToUtc(date, time, store.tz);
  const endDt = new Date(startDt.getTime() + SLOT_MINUTES * 60000);
  const base = {
    ParentRecordId: customer.Id, ContactId: customer.PersonContactId, ServiceTerritoryId: store.id,
    EarliestStartTime: startDt.toISOString(), DueDate: endDt.toISOString(),
    SchedStartTime: startDt.toISOString(), SchedEndTime: endDt.toISOString(),
    Duration: SLOT_MINUTES, DurationType: 'Minutes', Status: 'Scheduled', AppointmentType: 'In a Center',
    Subject: `Appuntamento in negozio – ${store.name}`.slice(0, 255), Description: notes || null,
    Email: email, Phone: phone || null, Booking_Source__c: 'Web',
  };
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      const { id } = await sf('POST', '/sobjects/ServiceAppointment', { ...base, Booking_Code__c: code });
      return { id, code };
    } catch (e) {
      if (e.code !== 'DUPLICATE_VALUE') throw e;
    }
  }
  throw new HttpError(500, 'Impossibile generare il codice di prenotazione. Riprova.');
}

const SA_FIELDS = `Id, Booking_Code__c, Status, SchedStartTime, Arrived_At__c, Email, AccountId, Account.Name,
  Account.FirstName, Account.LastName, Account.PersonEmail, ServiceTerritory.Name, ServiceTerritory.Description,
  ServiceTerritory.OperatingHours.TimeZone`;

export function toDashboard(r, tz) {
  const tzz = tz || r.ServiceTerritory?.OperatingHours?.TimeZone || 'Europe/Rome';
  const local = r.SchedStartTime ? utcToLocal(r.SchedStartTime, tzz) : {};
  let status = 'pending';
  if (r.Status === 'In Progress') status = 'in_progress';
  else if (r.Status === 'Completed') status = 'done';
  else if (r.Arrived_At__c) status = 'arrived';
  return {
    id: r.Id, code: r.Booking_Code__c, accountId: r.AccountId,
    name: r.Account?.Name || '', first_name: r.Account?.FirstName || '', last_name: r.Account?.LastName || '',
    email: r.Email || r.Account?.PersonEmail || '',
    preferred_date: local.date || '', preferred_time: local.time || '',
    status, arrived_at: r.Arrived_At__c || null, crm_status: r.Status,
    store_name: r.ServiceTerritory?.Description || r.ServiceTerritory?.Name || '',
  };
}

export async function listAppointments(store, date) {
  const start = localToUtc(date, '00:00', store.tz).toISOString();
  const end = localToUtc(addDays(date, 1), '00:00', store.tz).toISOString();
  const rows = await query(`SELECT ${SA_FIELDS} FROM ServiceAppointment
    WHERE ServiceTerritoryId = ${q(store.id)} AND SchedStartTime >= ${start} AND SchedStartTime < ${end}
    AND Booking_Code__c != null AND Status NOT IN ('Canceled', 'Cannot Complete') ORDER BY SchedStartTime ASC`);
  return rows.map((r) => toDashboard(r, store.tz));
}

export async function getAppointmentByCode(code) {
  const rows = await query(`SELECT ${SA_FIELDS} FROM ServiceAppointment WHERE Booking_Code__c = ${q(code)} LIMIT 1`);
  return rows[0] || null;
}

export async function getAppointmentById(id) {
  const rows = await query(`SELECT ${SA_FIELDS} FROM ServiceAppointment WHERE Id = ${q(id)} LIMIT 1`);
  return rows[0] || null;
}

export const updateAppointment = (id, fields) => sf('PATCH', `/sobjects/ServiceAppointment/${id}`, fields);
