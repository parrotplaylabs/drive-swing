import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { enrichSettings, nowIso, normalizeBooking } from '../lib/helpers.js';

export const DEFAULT_SETTINGS = {
  operatingHours: { open: '07:00', close: '21:00' },
  slotMinutes: 30,
  rangeTypes: [
    { id: 'grass', label: 'Grass', defaultPrice: 15, active: true },
    { id: 'simulator', label: 'Simulator', defaultPrice: 25, active: true },
    { id: 'covered', label: 'Covered Mat', defaultPrice: 12, active: true },
  ],
  currency: 'USD',
  defaultPaymentType: 'cash',
  paymentTypes: [
    { id: 'cash', label: 'Cash' },
    { id: 'bank', label: 'Bank transfer' },
    { id: 'ewallet', label: 'E-wallet' },
    { id: 'card', label: 'Card' },
    { id: 'other', label: 'Other' },
  ],
};

const EMPTY_DATA = {
  meta: {
    nextId: {
      ranges: 1,
      players: 1,
      bookings: 1,
    },
  },
  settings: { ...DEFAULT_SETTINGS },
  ranges: [],
  players: [],
  bookings: [],
};

let writeQueue = Promise.resolve();

function enqueue(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(config.dataPath), { recursive: true });
  try {
    await fs.access(config.dataPath);
  } catch {
    await fs.writeFile(config.dataPath, JSON.stringify(EMPTY_DATA, null, 2), 'utf8');
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(config.dataPath, 'utf8');
  const data = JSON.parse(raw);
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  if (!data.settings.rangeTypes?.length) {
    data.settings.rangeTypes = DEFAULT_SETTINGS.rangeTypes;
  }
  delete data.settings.durations;
  return data;
}

async function writeData(data) {
  const tmp = `${config.dataPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, config.dataPath);
}

function nextId(data, key) {
  if (!data.meta.nextId[key]) data.meta.nextId[key] = 1;
  return data.meta.nextId[key]++;
}

function enrichRange(range, data) {
  const typeInfo = data.settings.rangeTypes.find((t) => t.id === range.type);
  return {
    ...range,
    type_label: typeInfo?.label || range.type,
    type_active: typeInfo?.active !== false,
    default_price: typeInfo?.defaultPrice ?? 0,
  };
}

function isRangeTypeActive(settings, typeId) {
  const typeInfo = settings.rangeTypes?.find((t) => t.id === typeId);
  return typeInfo ? typeInfo.active !== false : true;
}

function enrichBooking(booking, data) {
  const range = data.ranges.find((r) => r.id === booking.range_id);
  const player = booking.player_id
    ? data.players.find((p) => p.id === booking.player_id)
    : null;
  const normalized = normalizeBooking(booking, data.settings);
  const paymentType = normalized.payment_type || data.settings.defaultPaymentType || 'cash';
  const typeInfo = (data.settings.paymentTypes || []).find((t) => t.id === paymentType);
  return {
    ...normalized,
    payment_type: paymentType,
    payment_reference: normalized.payment_reference || '',
    payment_type_label: typeInfo?.label || paymentType,
    range_name: range?.name || '',
    range_type: range?.type || '',
    player_phone: player?.phone || '',
  };
}

export const store = {
  async read() {
    return readData();
  },

  async mutate(mutator) {
    return enqueue(async () => {
      const data = await readData();
      const result = await mutator(data);
      await writeData(data);
      return result;
    });
  },

  async replaceAll(newData) {
    return enqueue(async () => {
      await writeData(newData);
      return true;
    });
  },

  async getSettings() {
    const data = await readData();
    return enrichSettings(data.settings);
  },

  async updateSettings(updates) {
    return this.mutate((data) => {
      const next = { ...data.settings, ...updates };
      delete next.durations;
      if (updates.rangeTypes) {
        next.rangeTypes = updates.rangeTypes;
      }
      if (updates.operatingHours) {
        next.operatingHours = {
          ...next.operatingHours,
          ...updates.operatingHours,
        };
      }
      data.settings = next;
      return enrichSettings(data.settings);
    });
  },

  async listRanges({ includeInactive = false, includeInactiveTypes = false } = {}) {
    const data = await readData();
    return data.ranges
      .filter((r) => {
        if (!includeInactive && !r.active) return false;
        if (!includeInactiveTypes && !isRangeTypeActive(data.settings, r.type)) return false;
        return true;
      })
      .map((r) => enrichRange(r, data))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async findRange(id) {
    const data = await readData();
    const range = data.ranges.find((r) => r.id === id);
    return range ? enrichRange(range, data) : null;
  },

  async createRange({ name, type, notes = '' }) {
    return this.mutate((data) => {
      const range = {
        id: nextId(data, 'ranges'),
        name: String(name).trim(),
        type: String(type).trim(),
        active: true,
        notes: String(notes || '').trim(),
        created_at: nowIso(),
      };
      data.ranges.push(range);
      return enrichRange(range, data);
    });
  },

  async updateRange(id, updates) {
    return this.mutate((data) => {
      const range = data.ranges.find((r) => r.id === id);
      if (!range) return null;
      if (updates.name !== undefined) range.name = String(updates.name).trim();
      if (updates.type !== undefined) range.type = String(updates.type).trim();
      if (updates.active !== undefined) range.active = Boolean(updates.active);
      if (updates.notes !== undefined) range.notes = String(updates.notes || '').trim();
      range.updated_at = nowIso();
      return enrichRange(range, data);
    });
  },

  async deleteRange(id) {
    return this.mutate((data) => {
      const range = data.ranges.find((r) => r.id === id);
      if (!range) return { ok: false, error: 'Range not found' };
      const today = new Date().toISOString().slice(0, 10);
      const hasFuture = data.bookings.some(
        (b) => b.range_id === id && b.status !== 'cancelled' && b.date >= today
      );
      if (hasFuture) {
        range.active = false;
        range.updated_at = nowIso();
        return { ok: true, deactivated: true };
      }
      data.ranges = data.ranges.filter((r) => r.id !== id);
      return { ok: true, deleted: true };
    });
  },

  async listPlayers(q = '') {
    const data = await readData();
    const query = String(q).trim().toLowerCase();
    return data.players
      .filter((p) => {
        if (!query) return true;
        return (
          p.name.toLowerCase().includes(query) ||
          (p.phone || '').toLowerCase().includes(query) ||
          (p.email || '').toLowerCase().includes(query)
        );
      })
      .map((p) => {
        const lastBooking = data.bookings
          .filter((b) => b.player_id === p.id && b.status !== 'cancelled')
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        return {
          ...p,
          last_booked_date: lastBooking?.date || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async findPlayer(id) {
    const data = await readData();
    return data.players.find((p) => p.id === id) || null;
  },

  async createPlayer({ name, phone = '', email = '', notes = '' }) {
    return this.mutate((data) => {
      const player = {
        id: nextId(data, 'players'),
        name: String(name).trim(),
        phone: String(phone || '').trim(),
        email: String(email || '').trim(),
        notes: String(notes || '').trim(),
        created_at: nowIso(),
      };
      data.players.push(player);
      return player;
    });
  },

  async importPlayers(rows, { skipDuplicates = true } = {}) {
    return this.mutate((data) => {
      const created = [];
      const skipped = [];
      const errors = [];

      for (const row of rows) {
        const name = String(row.name || '').trim();
        const line = row.line || null;

        if (!name) {
          errors.push({ line, error: 'Name is required' });
          continue;
        }

        const existing = data.players.find(
          (p) => p.name.toLowerCase() === name.toLowerCase()
        );
        if (existing) {
          if (skipDuplicates) {
            skipped.push({ line, name, reason: 'Already exists' });
            continue;
          }
        }

        const player = {
          id: nextId(data, 'players'),
          name,
          phone: String(row.phone || '').trim(),
          email: String(row.email || '').trim(),
          notes: String(row.notes || '').trim(),
          created_at: nowIso(),
        };
        data.players.push(player);
        created.push(player);
      }

      return {
        ok: true,
        created,
        skipped,
        errors,
        createdCount: created.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
      };
    });
  },

  async updatePlayer(id, updates) {
    return this.mutate((data) => {
      const player = data.players.find((p) => p.id === id);
      if (!player) return null;
      if (updates.name !== undefined) player.name = String(updates.name).trim();
      if (updates.phone !== undefined) player.phone = String(updates.phone || '').trim();
      if (updates.email !== undefined) player.email = String(updates.email || '').trim();
      if (updates.notes !== undefined) player.notes = String(updates.notes || '').trim();
      player.updated_at = nowIso();
      return player;
    });
  },

  async deletePlayer(id) {
    return this.mutate((data) => {
      const player = data.players.find((p) => p.id === id);
      if (!player) return { ok: false, error: 'Player not found' };
      const today = new Date().toISOString().slice(0, 10);
      const hasFuture = data.bookings.some(
        (b) => b.player_id === id && b.status !== 'cancelled' && b.date >= today
      );
      if (hasFuture) {
        return { ok: false, error: 'Player has upcoming bookings' };
      }
      data.players = data.players.filter((p) => p.id !== id);
      return { ok: true };
    });
  },

  async listBookings({ date, rangeId, fromDate, toDate, playerQ, status } = {}) {
    const data = await readData();
    const query = String(playerQ || '').trim().toLowerCase();
    return data.bookings
      .filter((b) => {
        if (date && b.date !== date) return false;
        if (rangeId && b.range_id !== Number(rangeId)) return false;
        if (fromDate && b.date < fromDate) return false;
        if (toDate && b.date > toDate) return false;
        if (status && b.status !== status) return false;
        if (query && !String(b.player_name || '').toLowerCase().includes(query)) return false;
        return true;
      })
      .map((b) => enrichBooking(b, data))
      .sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return b.start_time.localeCompare(a.start_time);
      });
  },

  async findBooking(id) {
    const data = await readData();
    const booking = data.bookings.find((b) => b.id === id);
    return booking ? enrichBooking(booking, data) : null;
  },

  async createBooking(booking) {
    return this.mutate((data) => {
      const item = {
        id: nextId(data, 'bookings'),
        ...booking,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      data.bookings.push(item);
      return enrichBooking(item, data);
    });
  },

  async updateBooking(id, updates) {
    return this.mutate((data) => {
      const booking = data.bookings.find((b) => b.id === id);
      if (!booking) return null;
      Object.assign(booking, updates, { updated_at: nowIso() });
      return enrichBooking(booking, data);
    });
  },

  async exportBackup() {
    return readData();
  },
};
