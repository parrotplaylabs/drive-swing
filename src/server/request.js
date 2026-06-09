import { URL } from 'url';
import { parseBody } from './body.js';
import { loadSession } from './session.js';

export async function buildRequest(incoming) {
  const url = new URL(incoming.url || '/', 'http://localhost');
  const req = {
    method: incoming.method || 'GET',
    url: incoming.url || '/',
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: incoming.headers,
    session: {},
    sessionId: null,
    params: {},
    body: {},
  };

  const loaded = loadSession(incoming);
  req.sessionId = loaded.sessionId;
  req.session = loaded.session;

  if (req.method === 'POST') {
    req.body = await parseBody(incoming);
  }

  return req;
}
