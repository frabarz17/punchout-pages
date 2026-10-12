const AGENT_API_BASE = 'https://api.salesforce.com/einstein/ai-agent/v1';

// Token cache — lives for the duration of this serverless invocation.
// On Vercel each cold start gets a fresh module; warm instances reuse it.
let _tokenCache = null;

async function ensureToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 120_000) {
    return _tokenCache;
  }
  const loginUrl = (process.env.AGENTFORCE_LOGIN_URL || '').replace(/\/$/, '');
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: process.env.AGENTFORCE_REFRESH_TOKEN || '',
    client_id:     process.env.AGENTFORCE_CLIENT_ID     || '',
    client_secret: process.env.AGENTFORCE_CLIENT_SECRET || '',
  });
  const r = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST', body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!r.ok) throw new Error(`Agentforce token error: ${r.status} ${await r.text()}`);
  const d = await r.json();
  const userToken   = d.access_token;
  const instanceUrl = d.instance_url.replace(/\/$/, '');

  const r2 = await fetch(`${instanceUrl}/agentforce/bootstrap/nameduser`, {
    headers: { Cookie: `sid=${userToken}` },
  });
  if (!r2.ok) throw new Error(`Agentforce bootstrap error: ${r2.status} ${await r2.text()}`);
  const jwt = (await r2.json()).access_token;

  _tokenCache = { jwt, instanceUrl, expiresAt: Date.now() + 25 * 60 * 1000 };
  return _tokenCache;
}

export async function startSession(externalKey) {
  const { jwt, instanceUrl } = await ensureToken();
  const agentId = process.env.AGENTFORCE_AGENT_ID || 'PersonalShopper';
  const r = await fetch(`${AGENT_API_BASE}/agents/${agentId}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      externalSessionKey: externalKey,
      instanceConfig: { endpoint: instanceUrl },
      streamingCapabilities: { chunkTypes: ['Text'] },
      bypassUser: true,
    }),
  });
  if (!r.ok) throw new Error(`startSession error: ${r.status} ${await r.text()}`);
  return (await r.json()).sessionId;
}

export async function sendMessage(sfSessionId, sequenceId, text) {
  const { jwt } = await ensureToken();
  const r = await fetch(`${AGENT_API_BASE}/sessions/${sfSessionId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { sequenceId, type: 'Text', text },
      variables: [],
    }),
  });
  if (!r.ok) throw new Error(`sendMessage error: ${r.status} ${await r.text()}`);
  const msgs = (await r.json()).messages || [];
  return msgs
    .filter(m => ['Text', 'Inform'].includes(m.type) && (m.text || m.message))
    .map(m => ({ type: 'text', content: m.text || m.message }));
}

export async function endSession(sfSessionId) {
  const { jwt } = await ensureToken();
  await fetch(`${AGENT_API_BASE}/sessions/${sfSessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  });
}
