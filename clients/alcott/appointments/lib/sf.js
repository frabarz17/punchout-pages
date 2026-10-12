// Salesforce REST client using the OAuth 2.0 Client Credentials flow.
// Env: SF_LOGIN_URL (My Domain), SF_CLIENT_ID, SF_CLIENT_SECRET, SF_API_VERSION

const API_VERSION = process.env.SF_API_VERSION || 'v62.0';
let tokenCache = null; // { accessToken, instanceUrl, expiresAt }

export class SfError extends Error {
  constructor(message, { status = 500, code, userMessage } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
  }
}

async function getToken(force = false) {
  if (!force && tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;
  const { SF_LOGIN_URL, SF_CLIENT_ID, SF_CLIENT_SECRET } = process.env;
  if (!SF_LOGIN_URL || !SF_CLIENT_ID || !SF_CLIENT_SECRET) {
    throw new SfError('Missing SF_LOGIN_URL / SF_CLIENT_ID / SF_CLIENT_SECRET', {
      status: 500, userMessage: 'Configurazione CRM mancante.' });
  }
  const res = await fetch(`${SF_LOGIN_URL.replace(/\/+$/, '')}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: SF_CLIENT_ID, client_secret: SF_CLIENT_SECRET }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new SfError(`Salesforce auth failed: ${data.error} ${data.error_description}`, {
      status: 502, userMessage: 'Impossibile collegarsi al CRM. Riprova.' });
  }
  // Session lifetime isn't returned for client credentials: cache for 30 min
  tokenCache = { accessToken: data.access_token, instanceUrl: data.instance_url, expiresAt: Date.now() + 30 * 60 * 1000 };
  return tokenCache;
}

export async function sf(method, path, body, retry = true) {
  const t = await getToken();
  const url = `${t.instanceUrl}/services/data/${API_VERSION}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${t.accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry) { await getToken(true); return sf(method, path, body, false); }
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = Array.isArray(data) ? data[0] : data;
    throw new SfError(`Salesforce ${method} ${path} → ${res.status}: ${err?.message}`, {
      status: res.status >= 500 ? 502 : 400, code: err?.errorCode });
  }
  return data;
}

export async function query(soql) {
  let data = await sf('GET', `/query?q=${encodeURIComponent(soql)}`);
  const records = [...data.records];
  while (!data.done && data.nextRecordsUrl) {
    data = await sf('GET', data.nextRecordsUrl.replace(/^\/services\/data/, ''));
    records.push(...data.records);
  }
  return records;
}

export const q = (v) => `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
