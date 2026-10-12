import { SfError } from './sf.js';

export class HttpError extends Error {
  constructor(status, userMessage) { super(userMessage); this.status = status; this.userMessage = userMessage; }
}

// Wrap a Vercel handler: method check + uniform { ok:false, error } responses (messages in Italian).
export function handler(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ ok: false, error: 'Metodo non consentito' });
    }
    try {
      await fn(req, res);
    } catch (e) {
      console.error('[api error]', e);
      const status = e.status || 500;
      const msg = e.userMessage || (e instanceof SfError ? 'Errore di comunicazione con il CRM. Riprova.' : 'Errore inatteso. Riprova.');
      res.status(status).json({ ok: false, error: msg });
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
