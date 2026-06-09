import { parseCsv } from '../lib/csv.js';
import { store } from '../store/dataStore.js';

const HEADER_ALIASES = {
  name: ['name', 'player', 'player name', 'full name'],
  phone: ['phone', 'tel', 'telephone', 'mobile', 'cell'],
  email: ['email', 'e-mail', 'mail'],
  notes: ['notes', 'note', 'comments', 'comment'],
};

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

function detectColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key)) {
        map[field] = index;
      }
    }
  });
  return Object.hasOwn(map, 'name') ? map : null;
}

function rowToPlayer(cells, columnMap) {
  const value = (field, fallbackIndex) => {
    const index = columnMap[field];
    if (index !== undefined) return String(cells[index] || '').trim();
    if (fallbackIndex !== undefined && cells[fallbackIndex] !== undefined) {
      return String(cells[fallbackIndex] || '').trim();
    }
    return '';
  };

  if (columnMap) {
    return {
      name: value('name'),
      phone: value('phone'),
      email: value('email'),
      notes: value('notes'),
    };
  }

  return {
    name: value('name', 0),
    phone: value('phone', 1),
    email: value('email', 2),
    notes: value('notes', 3),
  };
}

export function parsePlayerCsv(text) {
  const rows = parseCsv(text).filter((cells) => cells.some((cell) => cell.length > 0));
  if (!rows.length) return { ok: false, error: 'No data found in CSV' };

  const headerMap = detectColumnMap(rows[0]);
  const dataRows = headerMap ? rows.slice(1) : rows;
  if (!dataRows.length) return { ok: false, error: 'No player rows found in CSV' };

  const players = dataRows.map((cells, index) => ({
    line: (headerMap ? 2 : 1) + index,
    ...rowToPlayer(cells, headerMap),
  }));

  return { ok: true, players, hasHeader: Boolean(headerMap) };
}

export async function importPlayersFromCsv(text, { skipDuplicates = true } = {}) {
  const parsed = parsePlayerCsv(text);
  if (!parsed.ok) return parsed;

  return store.importPlayers(parsed.players, { skipDuplicates });
}
