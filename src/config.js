import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { isRailway, resolveDataPath } from './lib/deploy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootPath, '.env') });

export const config = {
  rootPath,
  appName: process.env.APP_NAME || 'Drive Swing',
  appEnv: process.env.APP_ENV || 'development',
  appDebug: process.env.APP_DEBUG === 'true',
  isRailway: isRailway(),
  port: Number(process.env.PORT || 3010),
  sessionSecret: process.env.SESSION_SECRET || 'drive-swing-dev-secret-change-me',
  dataPath: resolveDataPath(rootPath),
  operatorPin: process.env.OPERATOR_PIN || '',
};
