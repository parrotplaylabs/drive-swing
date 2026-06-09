export async function parseBody(req) {
  const type = req.headers['content-type'] || '';
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    const body = {};
    for (const [key, value] of params.entries()) {
      body[key] = value;
    }
    return body;
  }

  return {};
}
