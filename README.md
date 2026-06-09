# Drive Swing

> See every bay, book every session, and track payments from one lightweight desk — built for solo driving range operators.

Stop juggling paper sheets and phone calls. Drive Swing puts your schedule, roster, and daily revenue in one place: a day grid by bay (grass, simulator, covered mat), fast booking for walk-ins and regulars, payment type and reference on each session, and filters when you need to review who paid what.

Runs on a laptop or small server with plain Node.js and a single JSON file — no database, no monthly booking software, no build step. Configure hours, bay types, and prices in **Settings**, lock the app with an optional operator PIN, and back up your data anytime.

Built for driving ranges, practice facilities, and anyone running bays alone who wants clarity at the counter without enterprise overhead.

## Demo

[Watch the video demo](https://drive.proton.me/urls/F2CE28FJK8#p4r6kAnsMhYD)

## Features

- **Schedule** — day view grid by bay and 30-minute slots; click to book or view sessions
- **Book** — player typeahead from regular roster, walk-in names, optional save-to-roster
- **Players** — CRUD with search; import many at once by pasting CSV
- **Ranges** — manage bays by type (grass, simulator, covered mat)
- **Dashboard** — today's sessions, revenue tally, upcoming week
- **Payments** — payment type and reference on book/edit; history with player filter and running totals
- **Settings** — operating hours, default prices by type, backup/restore, reset sample data
- Plain Node.js `http` server with static HTML + JSON API (no framework or build step)
- Lightweight custom CSS UI with [Lucide](https://lucide.dev) icons via CDN

## Quick start

```bash
cd drive-swing
npm install
cp .env.example .env          # optional — edit settings
npm run seed                  # optional — sample bays, players, bookings
npm start
```

Open [http://localhost:3010](http://localhost:3010).

Or use Make:

```bash
make help      # list all commands
make setup     # .env + npm install
make seed      # sample data
make start     # background server
make stop
make restart
make status
make dev       # foreground with file watch
```

## Configuration

Copy `.env.example` to `.env` and edit as needed.

| Variable | Description |
| -------- | ----------- |
| `APP_NAME` | App title shown in the header |
| `APP_ENV` | `development` or `production` |
| `PORT` | Server port (default: `3010`) |
| `SESSION_SECRET` | Session signing secret (change in production) |
| `OPERATOR_PIN` | Require PIN unlock before use (leave empty for open local access) |
| `DATA_PATH` | Path to JSON data file (default: `storage/data.json`) |

Most day-to-day settings — operating hours, currency, default prices by bay type, payment types — are edited in **Settings** inside the app and saved to `storage/data.json`.

### Session durations

Durations are **30-minute steps** (e.g. `0 hr 30 min`, `1 hr 0 min`, `1 hr 30 min` …) up to the longest slot that fits your operating hours, plus **All day** for a full-day hold. Options update when you change open/close times in Settings.

## Data

All records live in a single JSON file (`storage/data.json` by default):

| Key | Contents |
| --- | -------- |
| `settings` | Operating hours, currency, range types, payment types |
| `ranges` | Bays / hitting stations |
| `players` | Regular player roster |
| `bookings` | Sessions, prices, payment info, status |

Download a backup anytime from **Settings → Download backup**. Restore via **Settings → Restore backup**, or run `npm run reset` to wipe and reload sample seed data.

## Deployment

### Local

```bash
make setup && make seed && make start   # background on http://localhost:3010
make status && make stop
```

Or `npm start` after `npm install`. Verify with `curl http://localhost:3010/api/health`.

### Railway

Host on [Railway](https://railway.com/?referralCode=iNLSQG) with a persistent volume mounted at `/app/storage`. Set `SESSION_SECRET` and `OPERATOR_PIN` in Railway variables.

See **[DEPLOY.md](DEPLOY.md)** for the full local and Railway setup guide (volume, env vars, health check, troubleshooting).

### Other hosts

On a VPS: `npm install --omit=dev`, optional `npm run seed`, then `npm start` or a process manager (PM2, systemd). Back up `storage/data.json` regularly.

## Consulting and Customization

Need custom workflows, features, or integrations?

Contact us at:

**[parrotplaylabs@protonmail.com](mailto:parrotplaylabs@protonmail.com)**

## License

MIT — see [LICENSE.md](LICENSE.md).
