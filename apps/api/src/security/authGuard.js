const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 10);
const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const WINDOW_MINUTES = Number(process.env.LOGIN_WINDOW_MINUTES || 15);

const attempts = new Map();

function now() {
  return Date.now();
}

function keyFor(email, ip) {
  return `${String(email || "").toLowerCase().trim()}|${ip || "unknown"}`;
}

function assertLoginAllowed(email, ip) {
  const key = keyFor(email, ip);
  const entry = attempts.get(key);
  if (!entry) return;
  if (entry.lockedUntil && entry.lockedUntil > now()) {
    const error = new Error("Demasiados intentos. Intenta nuevamente mas tarde.");
    error.statusCode = 429;
    throw error;
  }
  if (entry.lockedUntil && entry.lockedUntil <= now()) attempts.delete(key);
}

function registerLoginFailure(email, ip) {
  const key = keyFor(email, ip);
  const current = attempts.get(key) || { count: 0, firstAt: now(), lockedUntil: null };
  const outsideWindow = now() - current.firstAt > WINDOW_MINUTES * 60 * 1000;
  const next = outsideWindow ? { count: 1, firstAt: now(), lockedUntil: null } : { ...current, count: current.count + 1 };
  if (next.count >= MAX_ATTEMPTS) next.lockedUntil = now() + LOCK_MINUTES * 60 * 1000;
  attempts.set(key, next);
}

function registerLoginSuccess(email, ip) {
  attempts.delete(keyFor(email, ip));
}

module.exports = { assertLoginAllowed, registerLoginFailure, registerLoginSuccess };
