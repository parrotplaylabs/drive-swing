import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export async function tryServeStatic(pathname, res) {
  const publicRoot = path.join(config.rootPath, 'public');
  const rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(publicRoot, rel));

  if (!filePath.startsWith(publicRoot)) return false;

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.headers['Content-Type'] = MIME[ext] || 'application/octet-stream';
    if (ext !== '.html') {
      res.headers['Cache-Control'] = 'public, max-age=3600';
    }
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

export async function serveSpa(res) {
  const indexPath = path.join(config.rootPath, 'public', 'index.html');
  try {
    const data = await fs.readFile(indexPath);
    res.statusCode = 200;
    res.headers['Content-Type'] = 'text/html; charset=utf-8';
    res.end(data);
    return true;
  } catch {
    return false;
  }
}
