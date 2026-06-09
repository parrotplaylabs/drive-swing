import crypto from 'node:crypto';
import { ensureSession } from '../server/session.js';

export function ensureCsrfToken(req, res) {
  ensureSession(req, res);
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
}

export function requireCsrf(req, res) {
  const sessionToken = req.session?.csrfToken || '';
  const postedToken = req.body?._csrf || req.headers['x-csrf-token'] || '';
  if (!sessionToken || !postedToken || sessionToken !== postedToken) {
    res.status(403).json({ error: 'Invalid security token. Please refresh the page and try again.' });
  }
}
