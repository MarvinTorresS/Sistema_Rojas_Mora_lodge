'use strict';

// Autorización por operación, como en cabinas: máximo 5 intentos / 15 min
// por IP. Se aplica incluso si faltan credenciales; no confía en headers del cliente.
function createTableDeletionThrottle() {
  const attempts = new Map();
  const windowMs = 15 * 60 * 1000;
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = req.ip;
    const entry = attempts.get(key) ?? { count: 0, until: now + windowMs };
    if (entry.count >= 5 || (!attempts.has(key) && attempts.size >= 10000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.until - now) / 1000))));
      return res.status(429).json({ error: { message: 'Demasiados intentos de autorización. Intentá de nuevo en 15 minutos.' } });
    }
    entry.count += 1;
    attempts.set(key, entry);
    return next();
  };
}

module.exports = { createTableDeletionThrottle };
