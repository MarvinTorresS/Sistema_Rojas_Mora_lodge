'use strict';

// Limite acotado en memoria para los intentos de autorizacion manual.
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
module.exports = function cabinApprovalThrottle(req, res, next) {
  if (!req.body?.adminApproval) return next();
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = req.ip;
  const entry = attempts.get(key) ?? { count: 0, until: now + WINDOW };
  if (entry.count >= 5 || (!attempts.has(key) && attempts.size >= 10000)) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
    return res.status(429).json({ error: { message: 'Demasiados intentos de autorización. Intentá de nuevo en 15 minutos.' } });
  }
  entry.count += 1;
  attempts.set(key, entry);
  return next();
};
