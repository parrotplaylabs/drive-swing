import bcrypt from 'bcryptjs';
import { config } from '../config.js';

let pinHash = null;
let pinHashPromise = null;

async function getPinHash() {
  if (!config.operatorPin) return null;
  if (pinHash) return pinHash;
  if (!pinHashPromise) {
    pinHashPromise = bcrypt.hash(config.operatorPin, 10).then((hash) => {
      pinHash = hash;
      return hash;
    });
  }
  return pinHashPromise;
}

export function isPinRequired() {
  return Boolean(config.operatorPin);
}

export function isAuthenticated(req) {
  if (!isPinRequired()) return true;
  return Boolean(req.session?.authenticated);
}

export async function verifyPin(pin) {
  if (!config.operatorPin) return true;
  const hash = await getPinHash();
  return bcrypt.compare(String(pin), hash);
}
