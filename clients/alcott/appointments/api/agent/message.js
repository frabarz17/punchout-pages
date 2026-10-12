import { handler, body } from '../../lib/http.js';
import { sendMessage } from '../../lib/agentforce.js';
import { HttpError } from '../../lib/http.js';

export default handler(['POST'], async (req, res) => {
  const { sessionId, sequenceId, message } = body(req);
  if (!sessionId || !message?.trim()) throw new HttpError(400, 'sessionId e message richiesti');
  const seq = (parseInt(sequenceId) || 0) + 1;
  const responses = await sendMessage(sessionId, seq, message.trim());
  res.status(200).json({ ok: true, sequenceId: seq, responses: responses.length ? responses : [{ type: 'text', content: '…' }] });
});
