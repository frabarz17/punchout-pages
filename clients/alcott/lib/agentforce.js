const AGENT_API_BASE = 'https://api.salesforce.com/einstein/ai-agent/v1';

let _tokenCache = null; // v2 — JWT tokens enabled

async function ensureToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 120_000) {
    return _tokenCache;
  }
  const loginUrl = (process.env.AGENTFORCE_LOGIN_URL || '').replace(/\/$/, '');
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.AGENTFORCE_CLIENT_ID     || '',
    client_secret: process.env.AGENTFORCE_CLIENT_SECRET || '',
  });
  const r = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST', body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const tokenBody = await r.text();
  if (!r.ok) throw new Error(`Agentforce token error: ${r.status} ${tokenBody}`);
  const d = JSON.parse(tokenBody);
  const instanceUrl = (d.instance_url || loginUrl).replace(/\/$/, '');
  console.log('[agentforce] token ok, instance_url:', instanceUrl, '— token prefix:', d.access_token.slice(0, 3));
  _tokenCache = { accessToken: d.access_token, instanceUrl, expiresAt: Date.now() + 25 * 60 * 1000 };
  return _tokenCache;
}

function authHeaders(token, instanceUrl) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-sfdc-instance-url': instanceUrl,
  };
}

export async function startSession(externalKey) {
  const { accessToken, instanceUrl } = await ensureToken();
  const agentId = process.env.AGENTFORCE_AGENT_ID || '';
  const url     = `${AGENT_API_BASE}/agents/${agentId}/sessions`;
  const payload = {
    externalSessionKey: externalKey,
    instanceConfig: { endpoint: instanceUrl },
    streamingCapabilities: { chunkTypes: ['Text'] },
    bypassUser: true,
  };
  console.log('[agentforce] startSession url:', url);
  const r = await fetch(url, {
    method: 'POST',
    headers: authHeaders(accessToken, instanceUrl),
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  console.log('[agentforce] startSession response:', r.status, body.slice(0, 300));
  if (!r.ok) throw new Error(`startSession error: ${r.status} — ${body}`);
  return JSON.parse(body).sessionId;
}

export async function sendMessage(sfSessionId, sequenceId, text) {
  const { accessToken, instanceUrl } = await ensureToken();
  const r = await fetch(`${AGENT_API_BASE}/sessions/${sfSessionId}/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken, instanceUrl),
    body: JSON.stringify({
      message: { sequenceId, type: 'Text', text },
      variables: [],
    }),
  });
  if (!r.ok) throw new Error(`sendMessage error: ${r.status} ${await r.text()}`);
  const msgs = (await r.json()).messages || [];
  return msgs
    .filter(m => ['Text', 'Inform'].includes(m.type) && m.message)
    .map(m => ({ type: 'text', content: m.message }));
}

export async function endSession(sfSessionId) {
  const { accessToken, instanceUrl } = await ensureToken();
  await fetch(`${AGENT_API_BASE}/sessions/${sfSessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}`, 'x-sfdc-instance-url': instanceUrl, 'x-session-end-reason': 'UserRequest' },
  });
}
