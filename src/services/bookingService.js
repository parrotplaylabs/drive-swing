import {
  ALL_DAY,
  formatDuration,
  isAllDayDuration,
  isRangeTypeActive,
  listDurationOptions,
  minutesToTime,
  normalizeBooking,
  operatingMinutes,
  parseTimeToMinutes,
  resolvePaymentFields,
  todayDate,
} from '../lib/helpers.js';
import { store } from '../store/dataStore.js';

export function computeEndTime(startTime, durationMinutes) {
  const start = parseTimeToMinutes(startTime);
  if (start === null) return null;
  return minutesToTime(start + durationMinutes);
}

export function resolveBookingTimes(settings, durationInput, startTimeInput) {
  const fullDayMinutes = operatingMinutes(settings);
  if (isAllDayDuration(durationInput) || Number(durationInput) === fullDayMinutes) {
    const open = settings.operatingHours.open;
    const close = settings.operatingHours.close;
    const startM = parseTimeToMinutes(open);
    const endM = parseTimeToMinutes(close);
    if (startM === null || endM === null || endM <= startM) {
      return null;
    }
    return {
      all_day: true,
      start_time: open,
      end_time: close,
      duration_minutes: endM - startM,
    };
  }

  const durationMinutes = Number(durationInput);
  const endTime = computeEndTime(startTimeInput, durationMinutes);
  if (!endTime) return null;

  return {
    all_day: false,
    start_time: startTimeInput,
    end_time: endTime,
    duration_minutes: durationMinutes,
  };
}

export function bookingBlock(booking) {
  const start = parseTimeToMinutes(booking.start_time);
  const end = parseTimeToMinutes(booking.end_time);
  return { start, end };
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function getDefaultPrice(settings, rangeType) {
  const typeInfo = settings.rangeTypes.find((t) => t.id === rangeType);
  return typeInfo?.defaultPrice ?? 0;
}

export function buildTimeSlots(settings) {
  const open = parseTimeToMinutes(settings.operatingHours.open);
  const close = parseTimeToMinutes(settings.operatingHours.close);
  const step = settings.slotMinutes || 30;
  const slots = [];
  for (let m = open; m < close; m += step) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

export function validStartTimes(settings, durationInput) {
  if (isAllDayDuration(durationInput) || Number(durationInput) === operatingMinutes(settings)) {
    return [settings.operatingHours.open];
  }
  const durationMinutes = Number(durationInput);
  const open = parseTimeToMinutes(settings.operatingHours.open);
  const close = parseTimeToMinutes(settings.operatingHours.close);
  const step = settings.slotMinutes || 30;
  const starts = [];
  for (let m = open; m + durationMinutes <= close; m += step) {
    starts.push(minutesToTime(m));
  }
  return starts;
}

function isAllowedDuration(settings, durationInput) {
  if (isAllDayDuration(durationInput) || Number(durationInput) === operatingMinutes(settings)) {
    return true;
  }
  return listDurationOptions(settings).some((d) => Number(d) === Number(durationInput));
}

export async function getScheduleForDate(date) {
  const data = await store.read();
  const settings = data.settings;
  const slots = buildTimeSlots(settings);
  const ranges = data.ranges
    .filter((r) => r.active && isRangeTypeActive(settings, r.type))
    .map((r) => {
    const typeInfo = settings.rangeTypes.find((t) => t.id === r.type);
    return {
      ...r,
      type_label: typeInfo?.label || r.type,
      default_price: typeInfo?.defaultPrice ?? 0,
    };
  });

  const bookings = data.bookings
    .filter((b) => b.date === date && b.status !== 'cancelled')
    .map((b) => {
      const normalized = normalizeBooking(b, data.settings);
      const range = ranges.find((r) => r.id === normalized.range_id);
      return {
        ...normalized,
        range_name: range?.name || '',
        range_type: range?.type || '',
      };
    });

  return { date, settings, slots, ranges, bookings };
}

export async function checkConflict({ rangeId, date, startTime, durationInput, excludeBookingId }) {
  const data = await store.read();
  const resolved = resolveBookingTimes(data.settings, durationInput, startTime);
  if (!resolved) return { ok: false, error: 'Invalid start time or duration' };

  const newStart = parseTimeToMinutes(resolved.start_time);
  const newEnd = parseTimeToMinutes(resolved.end_time);

  const conflicts = data.bookings.filter((b) => {
    if (b.range_id !== rangeId) return false;
    if (b.date !== date) return false;
    if (b.status === 'cancelled') return false;
    if (excludeBookingId && b.id === excludeBookingId) return false;
    const { start, end } = bookingBlock(b);
    return overlaps(newStart, newEnd, start, end);
  });

  if (conflicts.length) {
    const message = isAllDayDuration(durationInput)
      ? 'Bay already has bookings on that day'
      : 'Bay already booked for that time';
    return { ok: false, error: message, conflicts };
  }
  return { ok: true, ...resolved };
}

export function validateBookingInput(body, settings) {
  const rangeId = Number(body.range_id);
  const date = String(body.date || '').trim();
  const durationInput = body.duration_minutes;
  const startTime = String(body.start_time || '').trim();
  const playerName = String(body.player_name || '').trim();

  if (!rangeId) return { ok: false, error: 'Range is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Valid date is required' };
  if (!isAllowedDuration(settings, durationInput)) {
    return {
      ok: false,
      error: `Duration must be ${listDurationOptions(settings).map(formatDuration).join(', ')}`,
    };
  }
  if (!playerName) return { ok: false, error: 'Player name is required' };

  const payment = resolvePaymentFields(body, settings);
  if (!payment.ok) return payment;

  const allDay = isAllDayDuration(durationInput) || Number(durationInput) === operatingMinutes(settings);
  if (!allDay && !startTime) return { ok: false, error: 'Start time is required' };

  const resolved = resolveBookingTimes(settings, durationInput, allDay ? settings.operatingHours.open : startTime);
  if (!resolved) return { ok: false, error: 'Invalid booking time' };

  if (!allDay) {
    const validStarts = validStartTimes(settings, durationInput);
    if (!validStarts.includes(startTime)) {
      return { ok: false, error: 'Start time is outside operating hours for this duration' };
    }
  }

  return {
    ok: true,
    data: {
      rangeId,
      date,
      ...resolved,
      playerName,
      playerId: body.player_id ? Number(body.player_id) : null,
      price: body.price !== undefined && body.price !== '' ? Number(body.price) : null,
      notes: String(body.notes || '').trim(),
      status: body.status || 'booked',
      savePlayer: Boolean(body.save_player),
      payment_type: payment.payment_type,
      payment_reference: payment.payment_reference,
    },
  };
}

export async function createBooking(body) {
  const data = await store.read();
  const validation = validateBookingInput(body, data.settings);
  if (!validation.ok) return validation;

  const range = data.ranges.find((r) => r.id === validation.data.rangeId && r.active);
  if (!range) return { ok: false, error: 'Range not found' };
  if (!isRangeTypeActive(data.settings, range.type)) {
    return { ok: false, error: 'This bay type is not available for booking' };
  }

  const conflict = await checkConflict({
    rangeId: validation.data.rangeId,
    date: validation.data.date,
    startTime: validation.data.start_time,
    durationInput: validation.data.all_day ? ALL_DAY : validation.data.duration_minutes,
  });
  if (!conflict.ok) return conflict;

  let playerId = validation.data.playerId;
  let playerName = validation.data.playerName;

  if (validation.data.savePlayer && !playerId) {
    const existing = data.players.find(
      (p) => p.name.toLowerCase() === playerName.toLowerCase()
    );
    if (existing) {
      playerId = existing.id;
    } else {
      const created = await store.createPlayer({ name: playerName });
      playerId = created.id;
    }
  }

  const price =
    validation.data.price !== null && !Number.isNaN(validation.data.price)
      ? validation.data.price
      : getDefaultPrice(data.settings, range.type);

  const booking = await store.createBooking({
    range_id: validation.data.rangeId,
    player_id: playerId || null,
    player_name: playerName,
    date: validation.data.date,
    start_time: validation.data.start_time,
    duration_minutes: validation.data.duration_minutes,
    end_time: validation.data.end_time,
    all_day: validation.data.all_day,
    price,
    status: validation.data.status,
    notes: validation.data.notes,
    payment_type: validation.data.payment_type,
    payment_reference: validation.data.payment_reference,
  });

  return { ok: true, booking };
}

export async function updateBooking(id, body) {
  const existing = await store.findBooking(id);
  if (!existing) return { ok: false, error: 'Booking not found' };

  const data = await store.read();
  const rangeId = body.range_id !== undefined ? Number(body.range_id) : existing.range_id;
  const date = body.date !== undefined ? String(body.date).trim() : existing.date;
  const durationInput =
    body.duration_minutes !== undefined ? body.duration_minutes : (existing.all_day ? ALL_DAY : existing.duration_minutes);
  const startTime =
    body.start_time !== undefined
      ? String(body.start_time).trim()
      : existing.start_time;

  if (!isAllowedDuration(data.settings, durationInput)) {
    return {
      ok: false,
      error: `Duration must be ${listDurationOptions(data.settings).map(formatDuration).join(', ')}`,
    };
  }

  const allDay = isAllDayDuration(durationInput) || Number(durationInput) === operatingMinutes(data.settings);
  const resolved = resolveBookingTimes(
    data.settings,
    durationInput,
    allDay ? data.settings.operatingHours.open : startTime
  );
  if (!resolved) return { ok: false, error: 'Invalid booking time' };

  if (!allDay) {
    const validStarts = validStartTimes(data.settings, durationInput);
    if (!validStarts.includes(resolved.start_time)) {
      return { ok: false, error: 'Start time is outside operating hours for this duration' };
    }
  }

  const range = data.ranges.find((r) => r.id === rangeId && r.active);
  if (!range) return { ok: false, error: 'Range not found' };
  if (!isRangeTypeActive(data.settings, range.type)) {
    return { ok: false, error: 'This bay type is not available for booking' };
  }

  const conflict = await checkConflict({
    rangeId,
    date,
    startTime: resolved.start_time,
    durationInput: allDay ? ALL_DAY : resolved.duration_minutes,
    excludeBookingId: id,
  });
  if (!conflict.ok) return conflict;

  const updates = {
    range_id: rangeId,
    date,
    start_time: resolved.start_time,
    duration_minutes: resolved.duration_minutes,
    end_time: resolved.end_time,
    all_day: resolved.all_day,
  };

  if (body.player_name !== undefined) updates.player_name = String(body.player_name).trim();
  if (body.player_id !== undefined) updates.player_id = body.player_id ? Number(body.player_id) : null;
  if (body.price !== undefined && body.price !== '') updates.price = Number(body.price);
  if (body.notes !== undefined) updates.notes = String(body.notes || '').trim();
  if (body.status !== undefined) updates.status = body.status;
  if (body.payment_type !== undefined || body.payment_reference !== undefined) {
    const payment = resolvePaymentFields(
      {
        payment_type: body.payment_type !== undefined ? body.payment_type : existing.payment_type,
        payment_reference:
          body.payment_reference !== undefined ? body.payment_reference : existing.payment_reference,
      },
      data.settings
    );
    if (!payment.ok) return payment;
    updates.payment_type = payment.payment_type;
    updates.payment_reference = payment.payment_reference;
  }

  const booking = await store.updateBooking(id, updates);
  return { ok: true, booking };
}

export async function cancelBooking(id) {
  const booking = await store.findBooking(id);
  if (!booking) return { ok: false, error: 'Booking not found' };
  const updated = await store.updateBooking(id, { status: 'cancelled' });
  return { ok: true, booking: updated };
}

export async function completeBooking(id) {
  const booking = await store.findBooking(id);
  if (!booking) return { ok: false, error: 'Booking not found' };
  const updated = await store.updateBooking(id, { status: 'completed' });
  return { ok: true, booking: updated };
}

export async function getDashboardStats() {
  const today = todayDate();
  const data = await store.read();
  const upcomingEnd = new Date(`${today}T12:00:00`);
  upcomingEnd.setDate(upcomingEnd.getDate() + 7);
  const upcomingEndStr = upcomingEnd.toISOString().slice(0, 10);

  const todayBookings = data.bookings
    .filter((b) => b.date === today && b.status !== 'cancelled')
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const upcoming = data.bookings
    .filter((b) => b.date > today && b.date <= upcomingEndStr && b.status === 'booked')
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.start_time.localeCompare(b.start_time);
    });

  const todayRevenue = todayBookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => sum + (Number(b.price) || 0), 0);

  return {
    today,
    todayBookings: todayBookings.map((b) => {
      const range = data.ranges.find((r) => r.id === b.range_id);
      return { ...b, range_name: range?.name || '' };
    }),
    upcoming: upcoming.map((b) => {
      const range = data.ranges.find((r) => r.id === b.range_id);
      return { ...b, range_name: range?.name || '' };
    }),
    todayRevenue,
    settings: data.settings,
  };
}

export async function getBookingHistory({ playerQ = '', status = '' } = {}) {
  const data = await store.read();
  const bookings = await store.listBookings({
    playerQ,
    status: status || undefined,
  });

  const payable = bookings.filter((b) => b.status !== 'cancelled');
  const totalPayments = payable.reduce((sum, b) => sum + (Number(b.price) || 0), 0);

  return {
    bookings,
    count: bookings.length,
    payableCount: payable.length,
    totalPayments,
    currency: data.settings.currency || 'USD',
    filters: { playerQ, status },
  };
}
