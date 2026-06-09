import crypto from 'node:crypto';
import { config } from '../config.js';

const COOKIE_NAME = 'driveswing.sid';
const sessions = new Map();

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('hex');
}

function createSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

export function loadSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[COOKIE_NAME];
  if (!raw) {
    return { sessionId: null, session: {} };
  }
  const [id, sig] = raw.split('.');
  if (!id || !sig || sign(id) !== sig) {
    return { sessionId: null, session: {} };
  }
  if (!sessions.has(id)) {
    sessions.set(id, {});
  }
  return { sessionId: id, session: sessions.get(id) };
}

export function ensureSession(req, res) {
  if (req.sessionId) return;
  const id = createSessionId();
  sessions.set(id, req.session);
  req.sessionId = id;
  setSessionCookie(res, id);
}

export function setSessionCookie(res, id) {
  const value = `${id}.${sign(id)}`;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (config.appEnv === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
}

export function destroySession(req, res) {
  if (req.sessionId) {
    sessions.delete(req.sessionId);
  }
  req.session = {};
  req.sessionId = null;
  clearSessionCookie(res);
}
