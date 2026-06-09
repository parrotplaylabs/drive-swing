import { todayDate, enrichSettings } from '../lib/helpers.js';
import { requireCsrf } from '../middleware/csrf.js';
import {
  cancelBooking,
  completeBooking,
  createBooking,
  getBookingHistory,
  getDashboardStats,
  getScheduleForDate,
  updateBooking,
  validStartTimes,
} from '../services/bookingService.js';
import { isAuthenticated, isPinRequired, verifyPin } from '../services/authService.js';
import { importPlayersFromCsv } from '../services/playerService.js';
import { buildSeedData } from '../lib/seedData.js';
import { destroySession } from '../server/session.js';
import { Router } from '../server/router.js';
import { config } from '../config.js';
import { store } from '../store/dataStore.js';

const router = new Router();

function publicConfig(req) {
  return {
    appName: config.appName,
    pinRequired: isPinRequired(),
    authenticated: isAuthenticated(req),
    csrfToken: req.session.csrfToken || '',
    settings: null,
  };
}

function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'PIN required. Please unlock the system.' });
  }
}

function guardPost(req, res) {
  if (isPinRequired()) requireCsrf(req, res);
  requireAuth(req, res);
}

router.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    app: config.appName,
    env: config.appEnv,
    railway: config.isRailway,
    dataPath: config.dataPath,
    volumeMount: process.env.RAILWAY_VOLUME_MOUNT_PATH || null,
    pinRequired: isPinRequired(),
  });
});

router.get('/api/config', async (req, res) => {
  const settings = await store.getSettings();
  res.json({ ...publicConfig(req), settings });
});

router.post('/api/auth/login', async (req, res) => {
  if (!isPinRequired()) {
    req.session.authenticated = true;
    return res.json({ ok: true, authenticated: true, csrfToken: req.session.csrfToken });
  }
  if (isPinRequired()) requireCsrf(req, res);
  if (res.ended) return;

  const pin = String(req.body.pin || '');
  const valid = await verifyPin(pin);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  req.session.authenticated = true;
  res.json({ ok: true, authenticated: true, csrfToken: req.session.csrfToken });
});

router.post('/api/auth/logout', async (req, res) => {
  if (isPinRequired()) requireCsrf(req, res);
  if (res.ended) return;
  destroySession(req, res);
  res.json({ ok: true, authenticated: false });
});

router.get('/api/dashboard', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const stats = await getDashboardStats();
  res.json(stats);
});

router.get('/api/schedule', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const date = req.query.date || todayDate();
  const schedule = await getScheduleForDate(date);
  res.json(schedule);
});

router.get('/api/meta/start-times', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const settings = await store.getSettings();
  const duration = req.query.duration ?? 60;
  res.json({ startTimes: validStartTimes(settings, duration), allDay: duration === 'all_day' });
});

router.get('/api/ranges', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const includeInactive = req.query.all === '1';
  const ranges = await store.listRanges({
    includeInactive,
    includeInactiveTypes: includeInactive,
  });
  res.json({ ranges });
});

router.post('/api/ranges', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const name = String(req.body.name || '').trim();
  const type = String(req.body.type || '').trim();
  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
  const settings = await store.getSettings();
  if (!settings.rangeTypes.some((t) => t.id === type)) {
    return res.status(400).json({ error: 'Invalid range type' });
  }
  const range = await store.createRange({
    name,
    type,
    notes: req.body.notes,
  });
  res.json({ range });
});

router.post('/api/ranges/:id/update', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const id = Number(req.params.id);
  const range = await store.updateRange(id, req.body);
  if (!range) return res.status(404).json({ error: 'Range not found' });
  res.json({ range });
});

router.post('/api/ranges/:id/delete', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const id = Number(req.params.id);
  const result = await store.deleteRange(id);
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result);
});

router.get('/api/players', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const players = await store.listPlayers(req.query.q || '');
  res.json({ players });
});

router.post('/api/players', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const player = await store.createPlayer(req.body);
  res.json({ player });
});

router.post('/api/players/import', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const csv = String(req.body.csv || req.body.text || '').trim();
  if (!csv) return res.status(400).json({ error: 'CSV data is required' });
  const result = await importPlayersFromCsv(csv, {
    skipDuplicates: req.body.skip_duplicates !== false,
  });
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post('/api/players/:id/update', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const id = Number(req.params.id);
  const player = await store.updatePlayer(id, req.body);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json({ player });
});

router.post('/api/players/:id/delete', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const id = Number(req.params.id);
  const result = await store.deletePlayer(id);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.get('/api/bookings/history', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const history = await getBookingHistory({
    playerQ: req.query.q || req.query.player || '',
    status: req.query.status || '',
  });
  res.json(history);
});

router.get('/api/bookings', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const bookings = await store.listBookings({
    date: req.query.date || undefined,
    rangeId: req.query.range_id ? Number(req.query.range_id) : undefined,
    fromDate: req.query.from || undefined,
    toDate: req.query.to || undefined,
  });
  res.json({ bookings });
});

router.get('/api/bookings/:id', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const booking = await store.findBooking(Number(req.params.id));
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json({ booking });
});

router.post('/api/bookings', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const result = await createBooking(req.body);
  if (!result.ok) return res.status(result.conflicts ? 409 : 400).json({ error: result.error });
  res.json({ booking: result.booking });
});

router.post('/api/bookings/:id/update', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const result = await updateBooking(Number(req.params.id), req.body);
  if (!result.ok) return res.status(result.conflicts ? 409 : 400).json({ error: result.error });
  res.json({ booking: result.booking });
});

router.post('/api/bookings/:id/cancel', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const result = await cancelBooking(Number(req.params.id));
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json({ booking: result.booking });
});

router.post('/api/bookings/:id/complete', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const result = await completeBooking(Number(req.params.id));
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json({ booking: result.booking });
});

router.get('/api/export/backup', async (req, res) => {
  requireAuth(req, res);
  if (res.ended) return;
  const data = await store.exportBackup();
  res.headers['Content-Type'] = 'application/json';
  res.headers['Content-Disposition'] = `attachment; filename="drive-swing-backup-${todayDate()}.json"`;
  res.end(JSON.stringify(data, null, 2));
});

router.post('/api/import/backup', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const payload = req.body;
  if (!payload || !payload.settings || !Array.isArray(payload.ranges)) {
    return res.status(400).json({ error: 'Invalid backup file' });
  }
  if (payload.settings.durations) delete payload.settings.durations;
  await store.replaceAll(payload);
  res.json({ ok: true });
});

router.post('/api/reset/reseed', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const seedData = buildSeedData();
  await store.replaceAll(seedData);
  res.json({
    ok: true,
    message: 'Data reset to sample seed.',
    settings: enrichSettings(seedData.settings),
  });
});

router.post('/api/settings/update', async (req, res) => {
  guardPost(req, res);
  if (res.ended) return;
  const settings = await store.updateSettings(req.body);
  res.json({ settings });
});

export default router;
