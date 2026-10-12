const AGENT_API_BASE = 'https://api.salesforce.com/einstein/ai-agent/v1';

let _tokenCache = null;

async function ensureToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 120_000) {
    return _tokenCache.accessToken;
  }
  const loginUrl = (process.env.AGENTFORCE_LOGIN_URL || '').replace(/\/$/, '');
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.AGENTFORCE_CLIENT_ID     || '',
    client_secret: process.env.AGENTFORCE_CLIENT_SECRET || '',
    scope:         'api chatbot_api sfap_api',
  });
  const r = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST', body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const tokenBody = await r.text();
  if (!r.ok) throw new Error(`Agentforce token error: ${r.status} ${tokenBody}`);
  const d = JSON.parse(tokenBody);
  console.log('[agentforce] token ok, scope:', d.scope);
  _tokenCache = { accessToken: d.access_token, expiresAt: Date.now() + 25 * 60 * 1000 };
  return _tokenCache.accessToken;
}

export async function startSession(externalKey) {
  const token    = await ensureToken();
  const agentId  = process.env.AGENTFORCE_AGENT_ID || '';
  const loginUrl = (process.env.AGENTFORCE_LOGIN_URL || '').replace(/\/$/, '');
  const url = `${AGENT_API_BASE}/agents/${agentId}/sessions`;
  const payload = {
    externalSessionKey: externalKey,
    instanceConfig: { endpoint: loginUrl },
    streamingCapabilities: { chunkTypes: ['Text'] },
    bypassUser: true,
  };
  console.log('[agentforce] startSession url:', url);
  console.log('[agentforce] startSession payload:', JSON.stringify(payload));
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  console.log('[agentforce] startSession response:', r.status, body);
  if (!r.ok) throw new Error(`startSession error: ${r.status} — ${body}`);
  return (await r.json()).sessionId;
}

export async function sendMessage(sfSessionId, sequenceId, text) {
  const token = await ensureToken();
  const r = await fetch(`${AGENT_API_BASE}/sessions/${sfSessionId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
  const token = await ensureToken();
  await fetch(`${AGENT_API_BASE}/sessions/${sfSessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'x-session-end-reason': 'UserRequest' },
  });
}
