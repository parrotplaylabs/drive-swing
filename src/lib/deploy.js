import fs from 'fs/promises';
import path from 'path';

export const STORAGE_VOLUME_MOUNT = '/app/storage';

const WEAK_SESSION_SECRETS = new Set([
  'change-me-to-a-random-string',
  'drive-swing-dev-secret-change-me',
]);

export function isRailway() {
  return Boolean(process.env.RAILWAY_ENVIRONMENT);
}

export function resolveDataPath(rootPath) {
  if (isRailway()) {
    const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (!volumeMount) {
      console.error(
        'Railway volume not linked. Attach a volume to this service at mount path /app/storage, then redeploy.'
      );
      console.error('Without a volume, data is stored on ephemeral disk and is lost on every redeploy.');
      process.exit(1);
    }
    if (volumeMount !== STORAGE_VOLUME_MOUNT) {
      console.warn(
        `Volume mounted at ${volumeMount}; recommended mount is ${STORAGE_VOLUME_MOUNT}. Using ${path.join(volumeMount, 'data.json')}`
      );
    }
    if (process.env.DATA_PATH) {
      const custom = path.isAbsolute(process.env.DATA_PATH)
        ? process.env.DATA_PATH
        : path.resolve(rootPath, process.env.DATA_PATH);
      const expected = path.join(volumeMount, 'data.json');
      if (custom !== expected) {
        console.warn(`Ignoring DATA_PATH=${process.env.DATA_PATH} on Railway; using ${expected}`);
      }
    }
    return path.join(volumeMount, 'data.json');
  }

  if (process.env.DATA_PATH) {
    return path.isAbsolute(process.env.DATA_PATH)
      ? process.env.DATA_PATH
      : path.resolve(rootPath, process.env.DATA_PATH);
  }
  return path.resolve(rootPath, 'storage/data.json');
}

export function validateProductionConfig({ sessionSecret, operatorPin }) {
  if (!isRailway()) return;

  if (!operatorPin) {
    console.error('On Railway, set OPERATOR_PIN to protect the booking desk on a public URL.');
    process.exit(1);
  }

  if (WEAK_SESSION_SECRETS.has(sessionSecret)) {
    console.error('On Railway, set SESSION_SECRET to a long random string (not the example value).');
    process.exit(1);
  }
}

export async function ensureStorageReady(dataPath) {
  const dir = path.dirname(dataPath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    console.error(`Data directory is not readable/writable: ${dir}`);
    if (isRailway()) {
      console.error('Try setting RAILWAY_RUN_UID=0 on the service, then redeploy.');
    }
    process.exit(1);
  }
}
