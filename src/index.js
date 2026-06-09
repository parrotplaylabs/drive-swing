import http from 'node:http';
import { config } from './config.js';
import { ensureStorageReady, validateProductionConfig } from './lib/deploy.js';
import { ensureCsrfToken } from './middleware/csrf.js';
import apiRoutes from './routes/api.js';
import { buildRequest } from './server/request.js';
import { createResponse } from './server/response.js';
import { serveSpa, tryServeStatic } from './server/static.js';

await ensureStorageReady(config.dataPath);
validateProductionConfig({
  sessionSecret: config.sessionSecret,
  operatorPin: config.operatorPin,
});

const server = http.createServer(async (incoming, serverRes) => {
  try {
    const req = await buildRequest(incoming);
    const res = createResponse(serverRes);

    if (req.pathname.startsWith('/api')) {
      ensureCsrfToken(req, res);
      const handled = await apiRoutes.dispatch(req, res);
      if (!handled && !res.ended) {
        res.status(404).json({ error: 'Not found' });
      }
      return;
    }

    if (req.method === 'GET') {
      if (await tryServeStatic(req.pathname, res)) return;
      if (await serveSpa(res)) return;
    }

    if (!res.ended) {
      res.status(404).send('Not found');
    }
  } catch (err) {
    console.error('Unhandled application error:', err);
    if (!serverRes.headersSent) {
      serverRes.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      serverRes.end(
        config.appDebug ? `Something went wrong: ${err.message}` : 'Something went wrong. Please try again later.'
      );
    }
  }
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`${config.appName} listening on port ${config.port}`);
  console.log(`Data file: ${config.dataPath}`);
  if (config.isRailway) {
    console.log(`Railway volume: ${process.env.RAILWAY_VOLUME_MOUNT_PATH || '(not set)'}`);
  }
});
