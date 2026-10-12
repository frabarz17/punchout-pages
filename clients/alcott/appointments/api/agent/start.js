import { handler } from '../../lib/http.js';
import { startSession } from '../../lib/agentforce.js';

export default handler(['POST'], async (req, res) => {
  const externalKey = `ck-${Math.random().toString(36).slice(2, 14)}`;
  const sfSessionId = await startSession(externalKey);
  res.status(200).json({ ok: true, sessionId: sfSessionId });
});
