import { addDays, nowIso, todayDate } from './helpers.js';
import { DEFAULT_SETTINGS } from '../store/dataStore.js';

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const PAYMENTS = ['cash', 'bank', 'ewallet', 'card', 'cash', 'ewallet', 'bank', 'cash'];

function booking(
  id,
  rangeId,
  playerId,
  playerName,
  date,
  startMin,
  duration,
  price,
  status,
  allDay = false,
  paymentIndex = 0
) {
  const open = 7 * 60;
  const close = 21 * 60;
  const endMin = allDay ? close : startMin + duration;
  const start = allDay ? open : startMin;
  const paymentType = PAYMENTS[paymentIndex % PAYMENTS.length];
  return {
    id,
    range_id: rangeId,
    player_id: playerId,
    player_name: playerName,
    date,
    start_time: minutesToTime(start),
    duration_minutes: endMin - start,
    end_time: minutesToTime(endMin),
    all_day: allDay,
    price,
    status,
    payment_type: paymentType,
    payment_reference: paymentType === 'cash' ? '' : `REF-${String(id).padStart(4, '0')}`,
    notes: allDay ? 'Private event' : '',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

export function buildSeedData() {
  const today = todayDate();
  const tomorrow = addDays(today, 1);
  const day2 = addDays(today, 2);
  const day3 = addDays(today, 3);

  return {
    meta: {
      nextId: {
        ranges: 8,
        players: 9,
        bookings: 17,
      },
    },
    settings: { ...DEFAULT_SETTINGS },
    ranges: [
      { id: 1, name: 'Grass Bay 1', type: 'grass', active: true, notes: '', created_at: nowIso() },
      { id: 2, name: 'Grass Bay 2', type: 'grass', active: true, notes: '', created_at: nowIso() },
      { id: 3, name: 'Grass Bay 3', type: 'grass', active: true, notes: '', created_at: nowIso() },
      { id: 4, name: 'Grass Bay 4', type: 'grass', active: true, notes: '', created_at: nowIso() },
      { id: 5, name: 'Simulator 1', type: 'simulator', active: true, notes: 'TrackMan', created_at: nowIso() },
      { id: 6, name: 'Simulator 2', type: 'simulator', active: true, notes: '', created_at: nowIso() },
      { id: 7, name: 'Covered Mat 1', type: 'covered', active: true, notes: '', created_at: nowIso() },
    ],
    players: [
      { id: 1, name: 'Alex Kim', phone: '555-0101', email: 'alex@example.com', notes: 'Prefers grass bays', created_at: nowIso() },
      { id: 2, name: 'Jordan Lee', phone: '555-0102', email: '', notes: '', created_at: nowIso() },
      { id: 3, name: 'Sam Rivera', phone: '555-0103', email: 'sam@example.com', notes: 'Weekly regular', created_at: nowIso() },
      { id: 4, name: 'Taylor Brooks', phone: '', email: '', notes: '', created_at: nowIso() },
      { id: 5, name: 'Morgan Chen', phone: '555-0105', email: '', notes: 'Simulator only', created_at: nowIso() },
      { id: 6, name: 'Casey Walsh', phone: '555-0106', email: '', notes: '', created_at: nowIso() },
      { id: 7, name: 'Riley Park', phone: '', email: 'riley@example.com', notes: '', created_at: nowIso() },
      { id: 8, name: 'Jamie Ortiz', phone: '555-0108', email: '', notes: '', created_at: nowIso() },
    ],
    bookings: [
      booking(1, 1, 1, 'Alex Kim', today, 9 * 60, 60, 15, 'completed', false, 0),
      booking(2, 5, 5, 'Morgan Chen', today, 10 * 60, 90, 25, 'booked', false, 1),
      booking(3, 2, 2, 'Jordan Lee', today, 11 * 60, 30, 15, 'booked', false, 2),
      booking(4, 3, 3, 'Sam Rivera', today, 14 * 60, 60, 15, 'booked', false, 3),
      booking(5, 6, 5, 'Morgan Chen', today, 16 * 60, 60, 25, 'booked', false, 4),
      booking(6, 7, 4, 'Taylor Brooks', today, 17 * 60, 30, 12, 'booked', false, 5),
      booking(7, 1, 6, 'Casey Walsh', tomorrow, 8 * 60 + 30, 90, 15, 'booked', false, 6),
      booking(8, 5, 1, 'Alex Kim', tomorrow, 10 * 60, 60, 25, 'booked', false, 7),
      booking(9, 4, 7, 'Riley Park', tomorrow, 12 * 60, 60, 15, 'booked', false, 0),
      booking(10, 2, 8, 'Jamie Ortiz', day2, 9 * 60, 30, 15, 'booked', false, 1),
      booking(11, 6, 3, 'Sam Rivera', day2, 11 * 60, 90, 25, 'booked', false, 2),
      booking(12, 3, 2, 'Jordan Lee', day2, 15 * 60, 60, 15, 'booked', false, 3),
      booking(13, 1, 4, 'Taylor Brooks', day3, 10 * 60, 60, 15, 'booked', false, 4),
      booking(14, 5, 6, 'Casey Walsh', day3, 13 * 60, 30, 25, 'booked', false, 5),
      booking(15, 7, null, 'Walk-in Guest', day3, 16 * 60, 30, 12, 'booked', false, 6),
      booking(16, 4, 3, 'Sam Rivera', day2, 7 * 60, 0, 120, 'booked', true, 1),
    ],
  };
}
