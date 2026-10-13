import { handler, readBody } from '../../lib/http.js';
import { endSession } from '../../lib/agentforce.js';

export default handler(['POST'], async (req, res) => {
  const { sessionId } = await readBody(req);
  if (sessionId) await endSession(sessionId).catch(() => {});
  res.status(200).json({ ok: true });
});
