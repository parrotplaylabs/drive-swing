const API = '/api';

let appConfig = null;
let bookPrefill = {};

function icon(name, cls = '') {
  const classes = cls ? `icon ${cls}` : 'icon';
  return `<i data-lucide="${name}" class="${classes}" aria-hidden="true"></i>`;
}

function refreshIcons(root = document) {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({ nameAttr: 'data-lucide', attrs: { 'aria-hidden': 'true' }, root });
  }
}

function formatDuration(minutes, allDay = false) {
  if (allDay === true || minutes === 'all_day') return 'All day';
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours} hr ${mins} min`;
}

function bookingDuration(booking) {
  return formatDuration(
    booking.duration_minutes,
    isAllDayBooking(booking, appConfig?.settings)
  );
}

function isAllDayBooking(booking, settings = appConfig?.settings) {
  if (Boolean(booking?.all_day)) return true;
  if (!settings?.operatingHours || !booking) return false;
  const open = timeToMin(settings.operatingHours.open);
  const close = timeToMin(settings.operatingHours.close);
  const start = timeToMin(booking.start_time);
  return Number(booking.duration_minutes) === close - open && start === open;
}

function normalizeDurationSelection(selected, settings = appConfig?.settings) {
  if (selected === 'all_day') return 'all_day';
  if (!settings?.operatingHours) return selected;
  const total = timeToMin(settings.operatingHours.close) - timeToMin(settings.operatingHours.open);
  if (Number(selected) === total) return 'all_day';
  return selected;
}

function selectedDurationForBooking(booking) {
  if (isAllDayBooking(booking, appConfig?.settings)) return 'all_day';
  return booking.duration_minutes;
}

function durationOptions(durations, selected) {
  const sel = normalizeDurationSelection(selected);
  return (durations || []).map((d) => {
    const isAllDay = d === 'all_day';
    const value = isAllDay ? 'all_day' : d;
    const label = isAllDay ? 'All day' : formatDuration(d);
    const isSelected = isAllDay
      ? sel === 'all_day'
      : Number(sel) === Number(d);
    return `<option value="${value}" ${isSelected ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function isAllDayDuration(value) {
  return value === 'all_day';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(amount, currency = 'USD') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function paymentTypeOptions(settings, selected) {
  const types = settings?.paymentTypes || [];
  const defaultType = settings?.defaultPaymentType || types[0]?.id || 'cash';
  const sel = selected || defaultType;
  return types.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === sel ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
}

function paymentTypeLabel(settings, typeId) {
  const types = settings?.paymentTypes || [];
  return types.find((t) => t.id === typeId)?.label || typeId || '—';
}

function activeRangeTypes(settings) {
  return (settings?.rangeTypes || []).filter((t) => t.active !== false);
}

function groupedRangesByType(ranges, settings) {
  const typesById = Object.fromEntries((settings?.rangeTypes || []).map((t) => [t.id, t]));
  const typeIds = [...new Set(ranges.map((r) => r.type))];
  return typeIds
    .map((id) => ({
      ...(typesById[id] || { id, label: id }),
      ranges: ranges.filter((r) => r.type === id),
    }))
    .filter((g) => g.ranges.length)
    .sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
}

function formatTime12(time) {
  const [h, m] = String(time).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function friendlyDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  clearTimeout(el._t);
  if (!msg) {
    el.textContent = '';
    el.classList.add('hidden');
    el.classList.remove('error');
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
  el._t = setTimeout(() => toast(''), 4000);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  if (appConfig?.csrfToken) {
    headers['X-CSRF-Token'] = appConfig.csrfToken;
  }
  const res = await fetch(API + path, { credentials: 'include', ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : null;
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

async function loadConfig() {
  appConfig = await api('/config');
  document.title = appConfig.appName;
  renderHeader();
}

function renderHeader() {
  const header = document.getElementById('site-header');
  if (!appConfig?.authenticated) {
    header.innerHTML = `<div class="header-inner"><a href="/" class="brand">${icon('flag-triangle-right')} ${escapeHtml(appConfig?.appName || 'Drive Swing')}</a></div>`;
    refreshIcons(header);
    return;
  }
  const path = window.location.pathname;
  const links = [
    ['/', 'layout-dashboard', 'Dashboard'],
    ['/schedule', 'calendar-days', 'Schedule'],
    ['/book', 'calendar-plus', 'Book'],
    ['/history', 'receipt', 'Payments'],
    ['/players', 'users', 'Players'],
    ['/ranges', 'grid-3x3', 'Ranges'],
    ['/settings', 'settings', 'Settings'],
  ];
  header.innerHTML = `
    <div class="header-inner">
      <a href="/" class="brand">${icon('flag-triangle-right')} ${escapeHtml(appConfig.appName)}</a>
      <nav class="nav">
        ${links.map(([href, ic, label]) => `<a href="${href}" class="${path === href || (href !== '/' && path.startsWith(href)) ? 'active' : ''}">${icon(ic, 'icon--sm')} ${label}</a>`).join('')}
        ${appConfig.pinRequired ? `<button class="btn btn-sm" data-action="logout" style="margin-left:0.5rem;background:rgba(255,255,255,0.15);border-color:transparent;color:#fff">${icon('lock', 'icon--sm')} Lock</button>` : ''}
      </nav>
    </div>`;
  refreshIcons(header);
}

function parseRoute() {
  const url = new URL(window.location.href);
  const path = url.pathname.replace(/\/$/, '') || '/';
  const query = Object.fromEntries(url.searchParams.entries());
  if (path === '/') return { name: 'dashboard', query };
  if (path === '/schedule') return { name: 'schedule', query };
  if (path === '/book') return { name: 'book', query };
  if (path === '/history') return { name: 'history', query };
  if (path === '/players') return { name: 'players', query };
  if (path === '/ranges') return { name: 'ranges', query };
  if (path === '/settings') return { name: 'settings', query };
  return { name: 'dashboard', query };
}

function navigate(path) {
  history.pushState(null, '', path);
  route();
}

async function route() {
  const app = document.getElementById('app');
  try {
    await loadConfig();
    if (appConfig.pinRequired && !appConfig.authenticated) {
      app.innerHTML = renderUnlock();
      refreshIcons(app);
      bindPageEvents();
      return;
    }
    renderHeader();
    const { name, query } = parseRoute();
    switch (name) {
      case 'dashboard': app.innerHTML = await renderDashboard(); break;
      case 'schedule': app.innerHTML = await renderSchedule(query); break;
      case 'book': app.innerHTML = await renderBook(query); break;
      case 'history': app.innerHTML = await renderHistory(query); break;
      case 'players': app.innerHTML = await renderPlayers(query); break;
      case 'ranges': app.innerHTML = await renderRanges(); break;
      case 'settings': app.innerHTML = await renderSettings(); break;
      default: app.innerHTML = await renderDashboard();
    }
    bindPageEvents();
    refreshIcons(app);
  } catch (err) {
    app.innerHTML = `<div class="card"><p>Error: ${escapeHtml(err.message)}</p><button class="btn" onclick="location.reload()">${icon('refresh-cw', 'icon--sm')} Retry</button></div>`;
    refreshIcons(app);
  }
}

function renderUnlock() {
  return `
    <div class="card unlock-screen">
      <h1>${icon('lock')} ${escapeHtml(appConfig?.appName || 'Drive Swing')}</h1>
      <p>Enter your operator PIN to unlock the system.</p>
      <form id="unlock-form">
        <div class="form-group">
          <label for="pin">PIN</label>
          <input type="password" id="pin" name="pin" inputmode="numeric" autocomplete="current-password" required autofocus>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">${icon('lock-open', 'icon--sm')} Unlock</button>
      </form>
    </div>`;
}

async function renderDashboard() {
  const data = await api('/dashboard');
  const currency = data.settings?.currency || 'USD';
  return `
    <h1 class="page-title">${icon('layout-dashboard')} Dashboard</h1>
    <div class="grid-2">
      <div class="card stat">
        <div class="stat-icon">${icon('calendar-check', 'icon--sm')}</div>
        <div class="stat-value">${data.todayBookings.length}</div>
        <div class="stat-label">Sessions today</div>
      </div>
      <div class="card stat">
        <div class="stat-icon">${icon('dollar-sign', 'icon--sm')}</div>
        <div class="stat-value">${formatMoney(data.todayRevenue, currency)}</div>
        <div class="stat-label">Revenue today</div>
      </div>
    </div>
    <div class="btn-group" style="margin-bottom:1rem">
      <a href="/book" class="btn btn-primary" data-nav>${icon('calendar-plus', 'icon--sm')} Book session</a>
      <a href="/schedule" class="btn" data-nav>${icon('calendar-days', 'icon--sm')} View schedule</a>
      <a href="/history" class="btn" data-nav>${icon('receipt', 'icon--sm')} Payment history</a>
    </div>
    <div class="card">
      <h2 style="margin:0 0 0.75rem;font-size:1.1rem;display:flex;align-items:center;gap:0.35rem">${icon('sun', 'icon--sm')} Today — ${friendlyDate(data.today)}</h2>
      ${data.todayBookings.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Time</th><th>Bay</th><th>Player</th><th>Duration</th><th>Price</th><th>Status</th></tr></thead>
          <tbody>
            ${data.todayBookings.map((b) => `
              <tr data-action="view-booking" data-id="${b.id}" style="cursor:pointer">
                <td>${formatTime12(b.start_time)} – ${formatTime12(b.end_time)}</td>
                <td>${escapeHtml(b.range_name)}</td>
                <td>${escapeHtml(b.player_name)}</td>
                <td>${bookingDuration(b)}</td>
                <td>${formatMoney(b.price, currency)}</td>
                <td><span class="badge badge-${b.status}">${b.status}</span></td>
              </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="empty-state">No sessions booked for today.</p>'}
    </div>
    <div class="card">
      <h2 style="margin:0 0 0.75rem;font-size:1.1rem;display:flex;align-items:center;gap:0.35rem">${icon('clock', 'icon--sm')} Upcoming (7 days)</h2>
      ${data.upcoming.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Time</th><th>Bay</th><th>Player</th><th>Duration</th></tr></thead>
          <tbody>
            ${data.upcoming.slice(0, 15).map((b) => `
              <tr data-action="view-booking" data-id="${b.id}" style="cursor:pointer">
                <td>${friendlyDate(b.date)}</td>
                <td>${formatTime12(b.start_time)}</td>
                <td>${escapeHtml(b.range_name)}</td>
                <td>${escapeHtml(b.player_name)}</td>
                <td>${bookingDuration(b)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="empty-state">No upcoming bookings.</p>'}
    </div>`;
}

function slotSpan(durationMinutes, slotMinutes = 30) {
  return durationMinutes / slotMinutes;
}

async function renderSchedule(query) {
  const date = query.date || todayDate();
  const data = await api(`/schedule?date=${encodeURIComponent(date)}`);
  const slotMinutes = data.settings.slotMinutes || 30;
  const cols = data.slots.length + 1;

  const bookingAt = (rangeId, slotTime) => {
    return data.bookings.find((b) => {
      if (b.range_id !== rangeId) return false;
      if (b.all_day) return slotTime === b.start_time;
      return b.start_time === slotTime;
    });
  };

  const isSlotCovered = (rangeId, slotTime) => {
    const slotStart = timeToMin(slotTime);
    return data.bookings.some((b) => {
      if (b.range_id !== rangeId) return false;
      const bStart = timeToMin(b.start_time);
      const bEnd = timeToMin(b.end_time);
      return slotStart >= bStart && slotStart < bEnd && b.start_time !== slotTime;
    });
  };

  let gridHtml = `<div class="schedule-grid" style="grid-template-columns: 120px repeat(${data.slots.length}, minmax(48px, 1fr))">`;

  gridHtml += `<div class="schedule-cell header bay-label">Bay</div>`;
  data.slots.forEach((slot) => {
    gridHtml += `<div class="schedule-cell header">${formatTime12(slot)}</div>`;
  });

  data.ranges.forEach((range) => {
    gridHtml += `<div class="schedule-cell bay-label type-${range.type}">${escapeHtml(range.name)}<br><small style="color:var(--muted)">${escapeHtml(range.type_label)}</small></div>`;

    const skipUntil = new Set();
    data.slots.forEach((slot) => {
      if (skipUntil.has(slot)) return;

      const booking = bookingAt(range.id, slot);
      if (booking) {
        const span = slotSpan(booking.duration_minutes, slotMinutes);
        for (let i = 1; i < span; i++) {
          const idx = data.slots.indexOf(slot) + i;
          if (data.slots[idx]) skipUntil.add(data.slots[idx]);
        }
        gridHtml += `
          <div class="schedule-cell" style="grid-column: span ${span}">
            <div class="booking-block type-${booking.range_type || range.type}${booking.all_day ? ' booking-block--all-day' : ''}" data-action="view-booking" data-id="${booking.id}">
              <div class="player">${escapeHtml(booking.player_name)}${booking.all_day ? ` ${icon('sun', 'icon--sm')}` : ''}</div>
              <div class="time">${booking.all_day ? 'All day' : `${formatTime12(booking.start_time)} – ${formatTime12(booking.end_time)}`}</div>
              <div>${bookingDuration(booking)} · ${formatMoney(booking.price, data.settings.currency)}</div>
            </div>
          </div>`;
      } else if (isSlotCovered(range.id, slot)) {
        gridHtml += `<div class="schedule-cell slot-busy"></div>`;
      } else {
        gridHtml += `
          <div class="schedule-cell slot-empty" data-action="quick-book"
            data-range-id="${range.id}" data-date="${date}" data-start="${slot}">
          </div>`;
      }
    });
  });

  gridHtml += '</div>';

  const scheduleBody = data.ranges.length
    ? `<div class="schedule-scroll">${gridHtml}</div>`
    : `<div class="card"><p class="empty-state">No bays available. Enable a bay type in Settings or add active bays under Ranges.</p></div>`;

  return `
    <h1 class="page-title">${icon('calendar-days')} Schedule</h1>
    <div class="schedule-toolbar">
      <div class="btn-group">
        <button class="btn btn-sm" data-action="schedule-nav" data-date="${addDays(date, -1)}">${icon('chevron-left', 'icon--sm')} Prev</button>
        <button class="btn btn-sm" data-action="schedule-nav" data-date="${todayDate()}">${icon('calendar', 'icon--sm')} Today</button>
        <button class="btn btn-sm" data-action="schedule-nav" data-date="${addDays(date, 1)}">Next ${icon('chevron-right', 'icon--sm')}</button>
      </div>
      <div class="schedule-date">${friendlyDate(date)}</div>
      <input type="date" value="${date}" data-action="schedule-date-pick" style="padding:0.4rem;border:1px solid var(--border);border-radius:8px">
    </div>
    ${scheduleBody}
    <p style="color:var(--muted);font-size:0.85rem;margin-top:0.75rem">Click an empty slot to book, or a session to view details.</p>`;
}

function timeToMin(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

async function renderBook(query) {
  const ranges = (await api('/ranges')).ranges;
  const settings = appConfig.settings;
  const date = query.date || bookPrefill.date || todayDate();
  const rangeId = query.range_id || bookPrefill.range_id || (ranges[0]?.id || '');
  const startTime = query.start || bookPrefill.start || '';
  const duration = Number(query.duration || bookPrefill.duration || 60);

  let startTimes = [];
  try {
    const st = await api(`/meta/start-times?duration=${duration}`);
    startTimes = st.startTimes;
  } catch { /* empty */ }

  const range = ranges.find((r) => r.id === Number(rangeId));
  const defaultPrice = range?.default_price ?? 0;

  const groupedRanges = groupedRangesByType(ranges, settings);

  return `
    <h1 class="page-title">${icon('calendar-plus')} Book Session</h1>
    <div class="card" style="max-width:560px">
      <form id="book-form">
        <div class="form-group">
          <label for="player-input">${icon('user', 'icon--sm')} Player</label>
          <div class="combobox-wrap">
            <input type="text" id="player-input" name="player_name" placeholder="Search regular players or type walk-in name" required autocomplete="off">
            <input type="hidden" id="player-id" name="player_id" value="">
            <div id="player-suggestions" class="combobox-list hidden"></div>
          </div>
          <div class="checkbox-row">
            <label class="checkbox-label" for="save-player">
              <input type="checkbox" name="save_player" id="save-player">
              <span>Save new name to regular players</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label for="range_id">${icon('grid-3x3', 'icon--sm')} Bay</label>
          <select id="range_id" name="range_id" required ${groupedRanges.length ? '' : 'disabled'}>
            ${groupedRanges.length ? groupedRanges.map((g) => `
              <optgroup label="${escapeHtml(g.label)}">
                ${g.ranges.map((r) => `<option value="${r.id}" ${Number(rangeId) === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
              </optgroup>`).join('') : '<option value="">No bays available — enable a type in Settings</option>'}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="date">Date</label>
            <input type="date" id="date" name="date" value="${date}" required>
          </div>
          <div class="form-group">
            <label for="duration_minutes">${icon('clock', 'icon--sm')} Duration</label>
            <select id="duration_minutes" name="duration_minutes">
              ${durationOptions(settings.durations, duration)}
            </select>
          </div>
        </div>
        <div class="form-group" id="start-time-group">
          <label for="start_time">${icon('clock-3', 'icon--sm')} Start time</label>
          <select id="start_time" name="start_time" required>
            <option value="">Select duration first…</option>
            ${startTimes.map((t) => `<option value="${t}" ${startTime === t ? 'selected' : ''}>${formatTime12(t)}</option>`).join('')}
          </select>
          <p id="all-day-hint" class="form-hint hidden">${icon('sun', 'icon--sm')} Covers full operating hours for the selected date.</p>
        </div>
        <div class="form-group">
          <label for="price">Price (${escapeHtml(settings.currency || 'USD')})</label>
          <input type="number" id="price" name="price" min="0" step="0.01" value="${defaultPrice}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="payment_type">${icon('wallet', 'icon--sm')} Payment type</label>
            <select id="payment_type" name="payment_type">
              ${paymentTypeOptions(settings)}
            </select>
          </div>
          <div class="form-group">
            <label for="payment_reference">Reference no.</label>
            <input type="text" id="payment_reference" name="payment_reference" placeholder="Txn ID, check no., etc.">
          </div>
        </div>
        <div class="form-group">
          <label for="notes">Notes</label>
          <textarea id="notes" name="notes" rows="2"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">${icon('check', 'icon--sm')} Book session</button>
      </form>
    </div>`;
}

async function renderHistory(query) {
  const playerQ = query.q || query.player || '';
  const status = query.status || '';
  const params = new URLSearchParams();
  if (playerQ) params.set('q', playerQ);
  if (status) params.set('status', status);
  const qs = params.toString();
  const data = await api(`/bookings/history${qs ? `?${qs}` : ''}`);
  const currency = data.currency || appConfig.settings?.currency || 'USD';
  const settings = appConfig.settings;

  return `
    <h1 class="page-title">${icon('receipt')} Payment history</h1>
    <div class="grid-2" style="margin-bottom:1rem">
      <div class="card stat">
        <div class="stat-icon">${icon('dollar-sign', 'icon--sm')}</div>
        <div class="stat-value">${formatMoney(data.totalPayments, currency)}</div>
        <div class="stat-label">Total payments${playerQ || status ? ' (filtered)' : ''}</div>
      </div>
      <div class="card stat">
        <div class="stat-icon">${icon('list', 'icon--sm')}</div>
        <div class="stat-value">${data.payableCount}</div>
        <div class="stat-label">Paid sessions${playerQ || status ? ' (filtered)' : ''}</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:1rem">
      <form id="history-filter" style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end">
        <div class="form-group" style="flex:1;min-width:180px;margin:0">
          <label for="history-player">${icon('user', 'icon--sm')} Player name</label>
          <input type="search" id="history-player" name="q" value="${escapeHtml(playerQ)}" placeholder="Filter by player…">
        </div>
        <div class="form-group" style="min-width:140px;margin:0">
          <label for="history-status">Status</label>
          <select id="history-status" name="status">
            <option value="" ${!status ? 'selected' : ''}>All statuses</option>
            <option value="booked" ${status === 'booked' ? 'selected' : ''}>Booked</option>
            <option value="completed" ${status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">${icon('filter', 'icon--sm')} Apply</button>
        ${playerQ || status ? `<a href="/history" class="btn" data-nav>${icon('x', 'icon--sm')} Clear</a>` : ''}
      </form>
    </div>
    <div class="card">
      ${data.bookings.length ? `
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Date</th><th>Player</th><th>Bay</th><th>Time</th><th>Price</th><th>Payment</th><th>Reference</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${data.bookings.map((b) => `
              <tr data-action="view-booking" data-id="${b.id}" style="cursor:pointer">
                <td>${friendlyDate(b.date)}</td>
                <td>${escapeHtml(b.player_name)}</td>
                <td>${escapeHtml(b.range_name)}</td>
                <td>${formatTime12(b.start_time)} – ${formatTime12(b.end_time)}</td>
                <td>${formatMoney(b.price, currency)}</td>
                <td>${escapeHtml(b.payment_type_label || paymentTypeLabel(settings, b.payment_type))}</td>
                <td>${escapeHtml(b.payment_reference || '—')}</td>
                <td><span class="badge badge-${b.status}">${b.status}</span></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
        <p style="font-size:0.85rem;color:var(--muted);margin:0.75rem 0 0">${data.count} booking${data.count === 1 ? '' : 's'} shown. Totals exclude cancelled sessions.</p>` : `<p class="empty-state">No bookings found${playerQ ? ` for “${escapeHtml(playerQ)}”` : ''}.</p>`}
    </div>`;
}

async function renderPlayers(query) {
  const q = query.q || '';
  const { players } = await api(`/players?q=${encodeURIComponent(q)}`);
  return `
    <h1 class="page-title">${icon('users')} Regular Players</h1>
    <div class="btn-group" style="margin-bottom:1rem">
      <form id="player-search" style="display:flex;gap:0.5rem;flex:1">
        <input type="search" name="q" value="${escapeHtml(q)}" placeholder="Search players…" style="flex:1;padding:0.5rem;border:1px solid var(--border);border-radius:8px">
        <button type="submit" class="btn">${icon('search', 'icon--sm')} Search</button>
      </form>
      <button class="btn btn-primary" data-action="add-player">${icon('user-plus', 'icon--sm')} Add player</button>
      <button class="btn" data-action="import-players">${icon('file-input', 'icon--sm')} Import CSV</button>
    </div>
    <div class="card">
      ${players.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Last booked</th><th></th></tr></thead>
          <tbody>
            ${players.map((p) => `
              <tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${escapeHtml(p.phone || '—')}</td>
                <td>${escapeHtml(p.email || '—')}</td>
                <td>${p.last_booked_date ? friendlyDate(p.last_booked_date) : '—'}</td>
                <td>
                  <button class="btn btn-sm" data-action="edit-player" data-id="${p.id}">${icon('pencil', 'icon--sm')} Edit</button>
                  <button class="btn btn-sm btn-danger" data-action="delete-player" data-id="${p.id}">${icon('trash-2', 'icon--sm')} Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="empty-state">No players yet. Add your regulars to speed up booking.</p>'}
    </div>`;
}

async function renderRanges() {
  const { ranges } = await api('/ranges?all=1');
  const types = appConfig.settings?.rangeTypes || [];
  return `
    <h1 class="page-title">${icon('grid-3x3')} Driving Ranges</h1>
    <div class="btn-group" style="margin-bottom:1rem">
      <button class="btn btn-primary" data-action="add-range">${icon('plus', 'icon--sm')} Add bay</button>
    </div>
    <div class="card">
      ${ranges.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Type</th><th>Default price</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${ranges.map((r) => `
              <tr class="type-${r.type}${r.type_active === false ? ' row-muted' : ''}">
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.type_label)}${r.type_active === false ? ' <span class="badge badge-cancelled">Type off</span>' : ''}</td>
                <td>${formatMoney(r.default_price, appConfig.settings?.currency)}</td>
                <td>${r.active ? '<span class="badge badge-booked">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>'}</td>
                <td>
                  <button class="btn btn-sm" data-action="edit-range" data-id="${r.id}">${icon('pencil', 'icon--sm')} Edit</button>
                  <button class="btn btn-sm btn-danger" data-action="delete-range" data-id="${r.id}">${icon('trash-2', 'icon--sm')} Remove</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table></div>` : '<p class="empty-state">No bays configured yet.</p>'}
    </div>
    <div class="card">
      <h2 style="margin:0 0 0.5rem;font-size:1rem">Bay types</h2>
      <ul style="margin:0;padding-left:1.25rem;color:var(--muted)">
        ${types.map((t) => `<li><strong>${escapeHtml(t.label)}</strong> — default ${formatMoney(t.defaultPrice, appConfig.settings?.currency)}${t.active === false ? ' <span class="badge badge-cancelled">Inactive</span>' : ' <span class="badge badge-booked">Active</span>'}</li>`).join('')}
      </ul>
      <p style="font-size:0.85rem;color:var(--muted);margin:0.5rem 0 0">Enable types and edit default prices in Settings.</p>
    </div>`;
}

async function renderSettings() {
  const s = appConfig.settings;
  const types = s.rangeTypes || [];
  return `
    <h1 class="page-title">${icon('settings')} Settings</h1>
    <div class="card" style="max-width:560px">
      <form id="settings-form">
        <h2 style="margin:0 0 0.75rem;font-size:1rem">Operating hours</h2>
        <div class="form-row">
          <div class="form-group">
            <label for="open">Open</label>
            <input type="time" id="open" name="open" value="${escapeHtml(s.operatingHours?.open || '07:00')}" required>
          </div>
          <div class="form-group">
            <label for="close">Close</label>
            <input type="time" id="close" name="close" value="${escapeHtml(s.operatingHours?.close || '21:00')}" required>
          </div>
        </div>
        <div class="form-group">
          <label for="currency">Currency</label>
          <input type="text" id="currency" name="currency" value="${escapeHtml(s.currency || 'USD')}" maxlength="3">
        </div>
        <h2 style="margin:1rem 0 0.75rem;font-size:1rem">Bay types</h2>
        <p style="font-size:0.85rem;color:var(--muted);margin:0 0 0.75rem">Turn types on or off to control which bays appear on the schedule and booking form.</p>
        ${types.map((t, i) => `
          <div class="form-group type-setting-row">
            <div class="checkbox-row" style="margin-bottom:0.35rem">
              <label class="checkbox-label" for="type-active-${i}">
                <input type="checkbox" id="type-active-${i}" data-type-active="${escapeHtml(t.id)}" ${t.active !== false ? 'checked' : ''}>
                <span><strong>${escapeHtml(t.label)}</strong></span>
              </label>
            </div>
            <label for="type-price-${i}" class="form-hint" style="display:block;margin-bottom:0.25rem">Default price</label>
            <input type="number" id="type-price-${i}" data-type-id="${escapeHtml(t.id)}" value="${t.defaultPrice}" min="0" step="0.01">
          </div>`).join('')}
        <button type="submit" class="btn btn-primary">${icon('save', 'icon--sm')} Save settings</button>
      </form>
    </div>
    <div class="card" style="max-width:560px">
      <h2 style="margin:0 0 0.75rem;font-size:1rem">Backup & restore</h2>
      <div class="btn-group">
        <a href="/api/export/backup" class="btn" download>${icon('download', 'icon--sm')} Download backup</a>
        <label class="btn" style="cursor:pointer">
          ${icon('upload', 'icon--sm')} Restore backup
          <input type="file" id="restore-file" accept="application/json,.json" style="display:none">
        </label>
      </div>
      <p style="font-size:0.85rem;color:var(--muted);margin:0.75rem 0 0">Restore replaces all bays, players, bookings, and settings.</p>
    </div>
    <div class="card card-danger" style="max-width:560px">
      <h2 style="margin:0 0 0.75rem;font-size:1rem;display:flex;align-items:center;gap:0.35rem">${icon('alert-triangle', 'icon--sm')} Reset data</h2>
      <p style="font-size:0.9rem;color:var(--muted);margin:0 0 0.75rem">Clear all bays, players, bookings, and settings, then reload the sample seed data. Download a backup first if you need to keep anything.</p>
      <button type="button" class="btn btn-danger" data-action="reset-reseed">${icon('rotate-ccw', 'icon--sm')} Reset &amp; reseed sample data</button>
    </div>`;
}

function showModal(html) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-panel').innerHTML = html;
  modal.classList.remove('hidden');
  refreshIcons(document.getElementById('modal-panel'));
}

function hideModal() {
  document.getElementById('modal').classList.add('hidden');
}

async function showBookingModal(id) {
  const { booking } = await api(`/bookings/${id}`);
  const currency = appConfig.settings?.currency || 'USD';
  showModal(`
    <h2>${icon('clipboard-list', 'icon--sm')} Session details</h2>
    <dl style="margin:0 0 1rem">
      <dt style="font-weight:600">Player</dt><dd style="margin:0 0 0.5rem">${escapeHtml(booking.player_name)}</dd>
      <dt style="font-weight:600">Bay</dt><dd style="margin:0 0 0.5rem">${escapeHtml(booking.range_name)}</dd>
      <dt style="font-weight:600">Date & time</dt><dd style="margin:0 0 0.5rem">${friendlyDate(booking.date)}, ${formatTime12(booking.start_time)} – ${formatTime12(booking.end_time)}</dd>
      <dt style="font-weight:600">Duration</dt><dd style="margin:0 0 0.5rem">${bookingDuration(booking)}</dd>
      <dt style="font-weight:600">Price</dt><dd style="margin:0 0 0.5rem">${formatMoney(booking.price, currency)}</dd>
      <dt style="font-weight:600">Payment</dt><dd style="margin:0 0 0.5rem">${escapeHtml(booking.payment_type_label || paymentTypeLabel(appConfig.settings, booking.payment_type))}${booking.payment_reference ? ` · ${escapeHtml(booking.payment_reference)}` : ''}</dd>
      <dt style="font-weight:600">Status</dt><dd style="margin:0 0 0.5rem"><span class="badge badge-${booking.status}">${booking.status}</span></dd>
      ${booking.notes ? `<dt style="font-weight:600">Notes</dt><dd style="margin:0 0 0.5rem">${escapeHtml(booking.notes)}</dd>` : ''}
    </dl>
    <div class="btn-group">
      ${booking.status === 'booked' ? `
        <button class="btn btn-primary btn-sm" data-action="complete-booking" data-id="${booking.id}">${icon('check-circle', 'icon--sm')} Mark completed</button>
        <button class="btn btn-sm" data-action="edit-booking" data-id="${booking.id}">${icon('pencil', 'icon--sm')} Edit</button>
        <button class="btn btn-danger btn-sm" data-action="cancel-booking" data-id="${booking.id}">${icon('x-circle', 'icon--sm')} Cancel</button>` : ''}
      <button class="btn btn-sm" data-action="close-modal">${icon('x', 'icon--sm')} Close</button>
    </div>`);
}

async function showEditBookingModal(id) {
  const { booking } = await api(`/bookings/${id}`);
  const config = await api('/config');
  appConfig.settings = config.settings;
  const settings = config.settings;
  const durationParam = selectedDurationForBooking(booking);
  const { startTimes } = await api(`/meta/start-times?duration=${encodeURIComponent(durationParam)}`);
  let ranges = (await api('/ranges')).ranges;
  if (!ranges.some((r) => r.id === booking.range_id)) {
    const { ranges: allRanges } = await api('/ranges?all=1');
    const current = allRanges.find((r) => r.id === booking.range_id);
    if (current) ranges = [...ranges, current];
  }
  const groupedRanges = groupedRangesByType(ranges, settings);

  showModal(`
    <h2>${icon('pencil', 'icon--sm')} Edit session</h2>
    <form id="edit-booking-form" data-id="${booking.id}">
      <div class="form-group">
        <label>Player name</label>
        <input type="text" name="player_name" value="${escapeHtml(booking.player_name)}" required>
      </div>
      <div class="form-group">
        <label>Bay</label>
        <select name="range_id">
          ${groupedRanges.map((g) => `
            <optgroup label="${escapeHtml(g.label)}">
              ${g.ranges.map((r) => `<option value="${r.id}" ${booking.range_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
            </optgroup>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date</label>
          <input type="date" name="date" value="${booking.date}" required>
        </div>
        <div class="form-group">
          <label>Duration</label>
          <select name="duration_minutes">
            ${durationOptions(settings.durations, selectedDurationForBooking(booking))}
          </select>
        </div>
      </div>
      <div class="form-group" id="edit-start-time-group">
        <label>Start time</label>
        <select name="start_time" id="edit-start-time">
          ${startTimes.map((t) => `<option value="${t}" ${booking.start_time === t ? 'selected' : ''}>${formatTime12(t)}</option>`).join('')}
        </select>
        <p class="form-hint edit-all-day-hint${isAllDayBooking(booking) ? '' : ' hidden'}">${icon('sun', 'icon--sm')} Full operating hours for this date.</p>
      </div>
      <div class="form-group">
        <label>Price</label>
        <input type="number" name="price" value="${booking.price}" min="0" step="0.01">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Payment type</label>
          <select name="payment_type">
            ${paymentTypeOptions(settings, booking.payment_type)}
          </select>
        </div>
        <div class="form-group">
          <label>Reference no.</label>
          <input type="text" name="payment_reference" value="${escapeHtml(booking.payment_reference || '')}" placeholder="Txn ID, check no., etc.">
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes" rows="2">${escapeHtml(booking.notes || '')}</textarea>
      </div>
      <div class="btn-group">
        <button type="submit" class="btn btn-primary">${icon('save', 'icon--sm')} Save</button>
        <button type="button" class="btn" data-action="close-modal">${icon('x', 'icon--sm')} Cancel</button>
      </div>
    </form>`);
  refreshEditStartTimes(document.getElementById('edit-booking-form'));
}

function showPlayerForm(player = null) {
  showModal(`
    <h2>${icon(player ? 'pencil' : 'user-plus', 'icon--sm')} ${player ? 'Edit player' : 'Add player'}</h2>
    <form id="player-form" data-id="${player?.id || ''}">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" value="${escapeHtml(player?.name || '')}" required>
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="tel" name="phone" value="${escapeHtml(player?.phone || '')}">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${escapeHtml(player?.email || '')}">
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes" rows="2">${escapeHtml(player?.notes || '')}</textarea>
      </div>
      <div class="btn-group">
        <button type="submit" class="btn btn-primary">${icon('save', 'icon--sm')} Save</button>
        <button type="button" class="btn" data-action="close-modal">${icon('x', 'icon--sm')} Cancel</button>
      </div>
    </form>`);
}

function showPlayerImportForm() {
  showModal(`
    <h2>${icon('file-input', 'icon--sm')} Import players from CSV</h2>
    <p style="font-size:0.9rem;color:var(--muted);margin:0 0 0.75rem">
      Paste CSV data below. Include a header row or use columns in order:
      <strong>name, phone, email, notes</strong>.
    </p>
    <form id="player-import-form">
      <div class="form-group">
        <label for="player-csv">CSV data</label>
        <textarea id="player-csv" name="csv" rows="10" placeholder="name,phone,email,notes&#10;Alex Kim,555-0101,alex@example.com,Prefers grass bays&#10;Jordan Lee,555-0102,," required></textarea>
      </div>
      <div class="checkbox-row">
        <label class="checkbox-label" for="skip-duplicates">
          <input type="checkbox" name="skip_duplicates" id="skip-duplicates" checked>
          <span>Skip players that already exist (by name)</span>
        </label>
      </div>
      <div class="btn-group">
        <button type="submit" class="btn btn-primary">${icon('upload', 'icon--sm')} Import</button>
        <button type="button" class="btn" data-action="close-modal">${icon('x', 'icon--sm')} Cancel</button>
      </div>
    </form>`);
}

function showRangeForm(range = null) {
  const types = appConfig.settings?.rangeTypes || [];
  showModal(`
    <h2>${icon(range ? 'pencil' : 'plus', 'icon--sm')} ${range ? 'Edit bay' : 'Add bay'}</h2>
    <form id="range-form" data-id="${range?.id || ''}">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" value="${escapeHtml(range?.name || '')}" required placeholder="e.g. Grass Bay 3">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select name="type">
          ${types.map((t) => `<option value="${t.id}" ${range?.type === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
        </select>
      </div>
      ${range ? `
        <div class="checkbox-row">
          <label class="checkbox-label" for="range-active">
            <input type="checkbox" name="active" id="range-active" ${range.active ? 'checked' : ''}>
            <span>Active</span>
          </label>
        </div>` : ''}
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes" rows="2">${escapeHtml(range?.notes || '')}</textarea>
      </div>
      <div class="btn-group">
        <button type="submit" class="btn btn-primary">${icon('save', 'icon--sm')} Save</button>
        <button type="button" class="btn" data-action="close-modal">${icon('x', 'icon--sm')} Cancel</button>
      </div>
    </form>`);
}

let playerSearchTimer = null;

async function refreshStartTimes() {
  const duration = document.getElementById('duration_minutes')?.value;
  const select = document.getElementById('start_time');
  const startGroup = document.getElementById('start-time-group');
  const allDayHint = document.getElementById('all-day-hint');
  const rangeSelect = document.getElementById('range_id');
  const priceInput = document.getElementById('price');
  if (!select || !duration) return;

  if (isAllDayDuration(duration)) {
    const open = appConfig.settings.operatingHours.open;
    const close = appConfig.settings.operatingHours.close;
    select.innerHTML = `<option value="${open}" selected>${formatTime12(open)} – ${formatTime12(close)}</option>`;
    select.disabled = true;
    allDayHint?.classList.remove('hidden');
    startGroup?.querySelector('label[for="start_time"]')?.classList.add('hidden');
    select.classList.add('hidden');
  } else {
    select.disabled = false;
    select.classList.remove('hidden');
    allDayHint?.classList.add('hidden');
    startGroup?.querySelector('label[for="start_time"]')?.classList.remove('hidden');
    const { startTimes } = await api(`/meta/start-times?duration=${encodeURIComponent(duration)}`);
    const current = select.value;
    select.innerHTML = startTimes.map((t) => `<option value="${t}">${formatTime12(t)}</option>`).join('');
    if (startTimes.includes(current)) select.value = current;
  }

  if (rangeSelect && priceInput) {
    const { ranges } = await api('/ranges');
    const range = ranges.find((r) => r.id === Number(rangeSelect.value));
    if (range) priceInput.value = range.default_price;
  }
}

async function refreshEditStartTimes(form) {
  if (!form) return;
  const duration = form.querySelector('[name="duration_minutes"]')?.value;
  const select = form.querySelector('#edit-start-time');
  const hint = form.querySelector('.edit-all-day-hint');
  if (!select || !duration) return;

  if (isAllDayDuration(duration)) {
    const open = appConfig.settings.operatingHours.open;
    const close = appConfig.settings.operatingHours.close;
    select.innerHTML = `<option value="${open}" selected>${formatTime12(open)} – ${formatTime12(close)}</option>`;
    select.disabled = true;
    hint?.classList.remove('hidden');
  } else {
    select.disabled = false;
    hint?.classList.add('hidden');
    const { startTimes } = await api(`/meta/start-times?duration=${encodeURIComponent(duration)}`);
    const current = select.value;
    select.innerHTML = startTimes.map((t) => `<option value="${t}">${formatTime12(t)}</option>`).join('');
    if (startTimes.includes(current)) select.value = current;
  }
}

function bindPageEvents() {
  const unlockForm = document.getElementById('unlock-form');
  if (unlockForm) {
    unlockForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const pin = unlockForm.pin.value;
        const result = await api('/auth/login', { method: 'POST', body: { pin } });
        appConfig.authenticated = true;
        appConfig.csrfToken = result.csrfToken;
        toast('Unlocked');
        route();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  document.getElementById('book-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    body.save_player = form.save_player?.checked || false;
    if (body.duration_minutes === 'all_day') {
      body.start_time = appConfig.settings.operatingHours.open;
    }
    try {
      await api('/bookings', { method: 'POST', body });
      toast('Session booked');
      bookPrefill = {};
      navigate('/schedule?date=' + body.date);
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.getElementById('duration_minutes')?.addEventListener('change', refreshStartTimes);
  document.getElementById('range_id')?.addEventListener('change', refreshStartTimes);

  if (document.getElementById('book-form') && isAllDayDuration(document.getElementById('duration_minutes')?.value)) {
    refreshStartTimes();
  }

  const playerInput = document.getElementById('player-input');
  if (playerInput) {
    playerInput.addEventListener('input', () => {
      clearTimeout(playerSearchTimer);
      playerSearchTimer = setTimeout(async () => {
        const q = playerInput.value.trim();
        const list = document.getElementById('player-suggestions');
        const hiddenId = document.getElementById('player-id');
        hiddenId.value = '';
        if (q.length < 1) {
          list.classList.add('hidden');
          return;
        }
        const { players } = await api(`/players?q=${encodeURIComponent(q)}`);
        if (!players.length) {
          list.classList.add('hidden');
          return;
        }
        list.innerHTML = players.slice(0, 8).map((p) => `
          <div class="combobox-item" data-id="${p.id}" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.phone ? ` <small style="color:var(--muted)">${escapeHtml(p.phone)}</small>` : ''}</div>
        `).join('');
        list.classList.remove('hidden');
      }, 200);
    });

    document.getElementById('player-suggestions')?.addEventListener('click', (e) => {
      const item = e.target.closest('.combobox-item');
      if (!item) return;
      document.getElementById('player-input').value = item.dataset.name;
      document.getElementById('player-id').value = item.dataset.id;
      document.getElementById('player-suggestions').classList.add('hidden');
      document.getElementById('save-player').checked = false;
    });
  }

  document.getElementById('settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const types = [...appConfig.settings.rangeTypes];
    form.querySelectorAll('[data-type-id]').forEach((input) => {
      const t = types.find((x) => x.id === input.dataset.typeId);
      if (t) t.defaultPrice = Number(input.value);
    });
    form.querySelectorAll('[data-type-active]').forEach((input) => {
      const t = types.find((x) => x.id === input.dataset.typeActive);
      if (t) t.active = input.checked;
    });
    try {
      const result = await api('/settings/update', {
        method: 'POST',
        body: {
          operatingHours: { open: form.open.value, close: form.close.value },
          currency: form.currency.value,
          rangeTypes: types,
        },
      });
      appConfig.settings = result.settings;
      toast('Settings saved');
    } catch (err) {
      toast(err.message, true);
    }
  });

  document.getElementById('restore-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Restore will replace all data. Continue?')) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await api('/import/backup', { method: 'POST', body: payload });
      toast('Backup restored');
      await loadConfig();
      route();
    } catch (err) {
      toast(err.message, true);
    }
    e.target.value = '';
  });

  document.getElementById('player-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q');
    navigate(`/players?q=${encodeURIComponent(q)}`);
  });

  document.getElementById('history-filter')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const params = new URLSearchParams();
    const q = form.q.value.trim();
    const status = form.status.value;
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const qs = params.toString();
    navigate(`/history${qs ? `?${qs}` : ''}`);
  });
}

document.addEventListener('click', async (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    e.preventDefault();
    navigate(nav.getAttribute('href'));
    return;
  }

  const action = e.target.closest('[data-action]');
  if (!action) {
    const link = e.target.closest('a[href^="/"]');
    if (link && !link.target && !link.hasAttribute('download')) {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    }
    return;
  }

  const act = action.dataset.action;

  if (act === 'close-modal') {
    hideModal();
    return;
  }

  if (act === 'logout') {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
      appConfig.authenticated = false;
      navigate('/');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  if (act === 'schedule-nav') {
    navigate('/schedule?date=' + action.dataset.date);
    return;
  }

  if (act === 'schedule-date-pick') return;

  if (act === 'quick-book') {
    bookPrefill = {
      range_id: action.dataset.rangeId,
      date: action.dataset.date,
      start: action.dataset.start,
      duration: 60,
    };
    navigate(`/book?range_id=${action.dataset.rangeId}&date=${action.dataset.date}&start=${action.dataset.start}`);
    return;
  }

  if (act === 'view-booking') {
    await showBookingModal(Number(action.dataset.id));
    return;
  }

  if (act === 'cancel-booking') {
    if (!confirm('Cancel this session?')) return;
    try {
      await api(`/bookings/${action.dataset.id}/cancel`, { method: 'POST', body: {} });
      hideModal();
      toast('Session cancelled');
      route();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  if (act === 'complete-booking') {
    try {
      await api(`/bookings/${action.dataset.id}/complete`, { method: 'POST', body: {} });
      hideModal();
      toast('Marked completed');
      route();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  if (act === 'edit-booking') {
    hideModal();
    await showEditBookingModal(Number(action.dataset.id));
    return;
  }

  if (act === 'add-player') {
    showPlayerForm();
    return;
  }

  if (act === 'import-players') {
    showPlayerImportForm();
    return;
  }

  if (act === 'edit-player') {
    const { players } = await api('/players');
    const player = players.find((p) => p.id === Number(action.dataset.id));
    if (player) showPlayerForm(player);
    return;
  }

  if (act === 'delete-player') {
    if (!confirm('Delete this player?')) return;
    try {
      await api(`/players/${action.dataset.id}/delete`, { method: 'POST', body: {} });
      toast('Player deleted');
      route();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  if (act === 'add-range') {
    showRangeForm();
    return;
  }

  if (act === 'edit-range') {
    const { ranges } = await api('/ranges?all=1');
    const range = ranges.find((r) => r.id === Number(action.dataset.id));
    if (range) showRangeForm(range);
    return;
  }

  if (act === 'delete-range') {
    if (!confirm('Remove this bay? It will be deactivated if it has upcoming bookings.')) return;
    try {
      await api(`/ranges/${action.dataset.id}/delete`, { method: 'POST', body: {} });
      toast('Bay removed');
      route();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  if (act === 'reset-reseed') {
    if (!confirm('Reset all data and reload sample seed? This cannot be undone.')) return;
    try {
      const result = await api('/reset/reseed', { method: 'POST', body: {} });
      appConfig.settings = result.settings;
      toast('Data reset to sample seed');
      navigate('/');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-action="schedule-date-pick"]')) {
    navigate('/schedule?date=' + e.target.value);
  }
  if (e.target.name === 'duration_minutes') {
    if (e.target.closest('#book-form')) refreshStartTimes();
    if (e.target.closest('#edit-booking-form')) refreshEditStartTimes(e.target.closest('#edit-booking-form'));
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'player-form') {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    const id = form.dataset.id;
    try {
      if (id) {
        await api(`/players/${id}/update`, { method: 'POST', body });
      } else {
        await api('/players', { method: 'POST', body });
      }
      hideModal();
      toast('Player saved');
      route();
    } catch (err) {
      toast(err.message, true);
    }
  }

  if (e.target.id === 'player-import-form') {
    e.preventDefault();
    const form = e.target;
    const csv = form.csv.value.trim();
    if (!csv) {
      toast('Paste CSV data to import', true);
      return;
    }
    try {
      const result = await api('/players/import', {
        method: 'POST',
        body: {
          csv,
          skip_duplicates: form.skip_duplicates?.checked ?? true,
        },
      });
      hideModal();
      const parts = [`Imported ${result.createdCount} player${result.createdCount === 1 ? '' : 's'}`];
      if (result.skippedCount) parts.push(`${result.skippedCount} skipped`);
      if (result.errorCount) parts.push(`${result.errorCount} errors`);
      toast(parts.join(', '));
      route();
    } catch (err) {
      toast(err.message, true);
    }
  }

  if (e.target.id === 'range-form') {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    if (form.dataset.id) body.active = form.active?.checked ?? true;
    const id = form.dataset.id;
    try {
      if (id) {
        await api(`/ranges/${id}/update`, { method: 'POST', body });
      } else {
        await api('/ranges', { method: 'POST', body });
      }
      hideModal();
      toast('Bay saved');
      route();
    } catch (err) {
      toast(err.message, true);
    }
  }

  if (e.target.id === 'edit-booking-form') {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    if (body.duration_minutes === 'all_day') {
      body.start_time = appConfig.settings.operatingHours.open;
    }
    const id = form.dataset.id;
    try {
      await api(`/bookings/${id}/update`, { method: 'POST', body });
      hideModal();
      toast('Session updated');
      route();
    } catch (err) {
      toast(err.message, true);
    }
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.combobox-wrap')) {
    document.getElementById('player-suggestions')?.classList.add('hidden');
  }
});

window.addEventListener('popstate', route);
route();
