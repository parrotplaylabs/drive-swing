# Deploying Drive Swing

This guide covers **local** hosting and [Railway](https://railway.com/?referralCode=iNLSQG) with persistent storage.

## Local deployment

### Quick start

```bash
cd drive-swing
make setup          # .env + npm install
make seed           # optional sample data
make dev            # foreground with file watch
```

Or without Make:

```bash
npm install
cp .env.example .env
npm run seed        # optional
npm start
```

Open [http://localhost:3010](http://localhost:3010).

### Background server (local)

```bash
make start          # background via nohup
make status
make stop
make restart
```

Logs: `drive-swing.log` · PID file: `.drive-swing.pid`

### Local environment variables

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `PORT` | `3010` | HTTP port |
| `SESSION_SECRET` | dev placeholder | Change for any shared machine |
| `OPERATOR_PIN` | *(empty)* | Set to require PIN unlock; recommended on LAN |
| `DATA_PATH` | `storage/data.json` | Relative to project root |

Data lives in `storage/data.json`. Back up via **Settings → Download backup** or copy that file.

### Verify locally

```bash
curl http://localhost:3010/api/health
```

Expected: `"ok": true`, `"dataPath"` ending in `storage/data.json`, `"railway": false`.

---

## Railway deployment

Railway auto-detects Node.js and runs `npm start`. No Dockerfile or build step required.

### Before you deploy

1. **Push to GitHub** (Railway deploys from a repo).
2. **Plan for persistent data** — without a volume, `data.json` is wiped on every redeploy.

### 1. Create the project

1. [railway.com](https://railway.com) → **New Project**
2. **Deploy from GitHub repo** → select `drive-swing`
3. Railway runs `npm install` and `npm start`

### 2. Add a volume (required)

1. Open your service in the Railway dashboard
2. **⌘K** (or right-click) → **Add Volume**
3. Attach it to the Drive Swing service
4. **Mount path:** `/app/storage`

The app stores data at `/app/storage/data.json` on the volume.

If writes fail with permission errors, add:

| Variable | Value |
| -------- | ----- |
| `RAILWAY_RUN_UID` | `0` |

### 3. Set environment variables

**Variables** tab on the service:

| Variable | Example | Required on Railway |
| -------- | ------- | ------------------- |
| `SESSION_SECRET` | long random string | Yes |
| `OPERATOR_PIN` | 4–8 digit PIN | Yes |
| `APP_NAME` | `Drive Swing` | Optional |
| `APP_ENV` | `production` | Optional |

Railway sets `PORT` and `RAILWAY_VOLUME_MOUNT_PATH` automatically — do not override `PORT`.

**Do not set `DATA_PATH` on Railway** unless you know what you're doing. The app uses the volume at `/app/storage/data.json`.

The app **refuses to start** on Railway without a linked volume, `OPERATOR_PIN`, and a non-default `SESSION_SECRET`.

### 4. Public URL

1. Service → **Settings** → **Networking**
2. **Generate domain** → e.g. `drive-swing-production.up.railway.app`

Open the URL and unlock with your operator PIN.

### 5. Seed sample data (optional)

From the Railway shell, once:

```bash
node scripts/seed.js
```

Skip for production — configure bays and players in the UI instead.

### 6. Verify deployment

```text
https://YOUR-APP.up.railway.app/api/health
```

Expected:

```json
{
  "ok": true,
  "railway": true,
  "dataPath": "/app/storage/data.json",
  "volumeMount": "/app/storage",
  "pinRequired": true
}
```

Deploy logs on startup should show:

```text
Drive Swing listening on port ...
Data file: /app/storage/data.json
Railway volume: /app/storage
```

Add a booking, redeploy, and confirm it still appears.

---

## Data persistence

- Git push does **not** sync live bookings to Railway.
- Use **Settings → Download backup** periodically for off-site backup.
- Restore via **Settings → Restore backup**, or replace `data.json` on the volume (stop the app first).

## Moving local data to Railway

**Option A — Start fresh** — deploy and configure bays in the UI.

**Option B — Backup restore** — **Settings → Download backup** locally, then **Restore backup** on Railway after first login.

**Option C — Copy file** — upload `storage/data.json` to the volume at `/app/storage/data.json` via Railway shell.

## Local vs Railway

| | Local | Railway |
| -- | ----- | ------- |
| Start | `make start` or `npm start` | Automatic on git push |
| Data | `./storage/data.json` | Volume at `/app/storage/data.json` |
| URL | `http://localhost:3010` | `https://*.up.railway.app` |
| PIN | Optional (`OPERATOR_PIN`) | Required |
| Health | `/api/health` | `/api/health` |

## Security

- Set `OPERATOR_PIN` and `SESSION_SECRET` before going live on a public URL.
- Railway provides HTTPS automatically.
- Leave `OPERATOR_PIN` empty only on trusted local machines.

## Troubleshooting

| Issue | Fix |
| ----- | --- |
| App crashes on Railway start | Check deploy logs; set `OPERATOR_PIN`, `SESSION_SECRET`, and attach volume |
| Data wiped on redeploy | Volume not mounted at `/app/storage` |
| `volumeMount` is null in `/api/health` | Volume not linked to the service |
| Permission errors on storage | Set `RAILWAY_RUN_UID=0` |
| Cannot access app | Enter `OPERATOR_PIN` on unlock screen |
| Port conflict locally | `PORT=3011 make start` |
