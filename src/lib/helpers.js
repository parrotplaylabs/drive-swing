export function nowIso() {
  return new Date().toISOString();
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function parseTimeToMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function friendlyDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime12(time) {
  const mins = parseTimeToMinutes(time);
  if (mins === null) return time;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const ALL_DAY = 'all_day';

export function isAllDayDuration(value) {
  return value === ALL_DAY || value === 'all_day';
}

export function isAllDayBooking(booking, settings) {
  if (Boolean(booking?.all_day)) return true;
  if (!settings?.operatingHours || !booking) return false;
  const open = parseTimeToMinutes(settings.operatingHours.open);
  const close = parseTimeToMinutes(settings.operatingHours.close);
  const start = parseTimeToMinutes(booking.start_time);
  return (
    Number(booking.duration_minutes) === close - open &&
    start === open
  );
}

export function normalizeDurationSelection(selected, settings) {
  if (isAllDayDuration(selected)) return ALL_DAY;
  if (!settings?.operatingHours) return selected;
  const total = operatingMinutes(settings);
  if (Number(selected) === total) return ALL_DAY;
  return selected;
}

export function normalizeBooking(booking, settings) {
  const merged = { ...booking, all_day: false };
  if (isAllDayBooking(booking, settings)) {
    merged.all_day = true;
    merged.start_time = settings.operatingHours.open;
    merged.end_time = settings.operatingHours.close;
    merged.duration_minutes = operatingMinutes(settings);
  }
  return merged;
}

export function operatingMinutes(settings) {
  const open = parseTimeToMinutes(settings.operatingHours.open);
  const close = parseTimeToMinutes(settings.operatingHours.close);
  return close - open;
}

export function formatDuration(minutes, allDay = false) {
  if (allDay === true || isAllDayDuration(minutes)) return 'All day';
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours} hr ${mins} min`;
}

export function listDurationOptions(settings) {
  const step = settings?.slotMinutes || 30;
  const total = operatingMinutes(settings);
  if (total <= 0) return [ALL_DAY];

  const options = [];
  for (let minutes = step; minutes < total; minutes += step) {
    options.push(minutes);
  }
  options.push(ALL_DAY);
  return options;
}

export function enrichSettings(settings) {
  const merged = { ...settings };
  delete merged.durations;
  if (!merged.paymentTypes?.length) {
    merged.paymentTypes = [
      { id: 'cash', label: 'Cash' },
      { id: 'bank', label: 'Bank transfer' },
      { id: 'ewallet', label: 'E-wallet' },
      { id: 'card', label: 'Card' },
      { id: 'other', label: 'Other' },
    ];
  }
  if (!merged.defaultPaymentType) merged.defaultPaymentType = 'cash';
  if (merged.rangeTypes?.length) {
    merged.rangeTypes = merged.rangeTypes.map((t) => ({
      ...t,
      active: t.active !== false,
    }));
  }
  return {
    ...merged,
    durations: listDurationOptions(merged),
  };
}

export function isRangeTypeActive(settings, typeId) {
  const typeInfo = settings.rangeTypes?.find((t) => t.id === typeId);
  return typeInfo ? typeInfo.active !== false : true;
}

export function activeRangeTypes(settings) {
  return (settings?.rangeTypes || []).filter((t) => t.active !== false);
}

export function resolvePaymentFields(body, settings) {
  const types = settings.paymentTypes || [];
  const defaultType = settings.defaultPaymentType || types[0]?.id || 'cash';
  let paymentType = String(body.payment_type || defaultType).trim();
  if (!types.some((t) => t.id === paymentType)) {
    return { ok: false, error: 'Invalid payment type' };
  }
  return {
    ok: true,
    payment_type: paymentType,
    payment_reference: String(body.payment_reference || '').trim(),
  };
}
