import { startSession } from '../../lib/agentforce.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const externalKey = `ck-${Math.random().toString(36).slice(2, 14)}`;
    const sfSessionId = await startSession(externalKey);
    res.status(200).json({ ok: true, sessionId: sfSessionId });
  } catch (e) {
    console.error('[agent/start]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
