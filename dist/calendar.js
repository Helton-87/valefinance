const calendar = $('date-calendar');
const dateToggle = $('date-toggle');
const dayGrid = $('date-days');
const fullDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'UTC' });
const fullMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
let calendarMonth;
let startDraft = '';

function activeDateRange() {
  return page === 'billing' ? billingDateRange : dateRange;
}

function setActiveDateRange(range) {
  if (page === 'billing') billingDateRange = range;
  else dateRange = range;
}

function localDateKey(date = new Date()) {
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function dateAtUtc(key) {
  return new Date(key + 'T00:00:00Z');
}

function monthAt(key) {
  return dateAtUtc(key.slice(0, 7) + '-01');
}

function showDateValue() {
  const [start, end] = activeDateRange();
  $('date-value').textContent = start
    ? dateFormat.format(dateAtUtc(start)) + ' – ' + dateFormat.format(dateAtUtc(end))
    : 'Selecionar período';
}

function showCalendarDays(focusKey) {
  $('date-month').textContent = fullMonth.format(calendarMonth);
  $('date-hint').textContent = startDraft ? 'Selecione a data final' : 'Selecione a data inicial';
  const year = calendarMonth.getUTCFullYear();
  const month = calendarMonth.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const [start, end] = startDraft ? [startDraft, startDraft] : activeDateRange();
  const today = localDateKey();
  const days = Array.from({ length: calendarMonth.getUTCDay() }, () => document.createElement('span'));
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month, day));
    const key = date.toISOString().slice(0, 10);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = day;
    button.dataset.date = key;
    button.setAttribute('aria-label', fullDate.format(date));
    button.setAttribute('aria-pressed', String(key >= start && key <= end));
    if (key === today) button.setAttribute('aria-current', 'date');
    if (key === start || key === end) button.classList.add('range-edge');
    days.push(button);
  }
  dayGrid.replaceChildren(...days);
  if (focusKey) dayGrid.querySelector(`[data-date="${focusKey}"]`)?.focus();
}

function closeCalendar(returnFocus = false) {
  calendar.hidden = true;
  dateToggle.setAttribute('aria-expanded', 'false');
  startDraft = '';
  if (returnFocus) dateToggle.focus();
}

function clearDateRange() {
  setActiveDateRange([]);
  const returnFocus = calendar.contains(document.activeElement);
  closeCalendar(returnFocus);
  showDateValue();
}

dateToggle.addEventListener('click', () => {
  if (!calendar.hidden) {
    closeCalendar();
    return;
  }
  const today = localDateKey();
  const dates = (page === 'billing' ? billingRecords : records).map(item => item.date).filter(Boolean).sort();
  const focusDate = activeDateRange()[0] || dates.find(date => date >= today) || dates.at(-1) || today;
  calendarMonth = monthAt(focusDate);
  calendar.hidden = false;
  dateToggle.setAttribute('aria-expanded', 'true');
  showCalendarDays(focusDate);
});

for (const [id, step] of [['date-prev', -1], ['date-next', 1]]) {
  $(id).addEventListener('click', () => {
    calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() + step);
    showCalendarDays();
  });
}

dayGrid.addEventListener('click', event => {
  const key = event.target.closest('[data-date]')?.dataset.date;
  if (!key) return;
  if (!startDraft) {
    startDraft = key;
    showCalendarDays(key);
    return;
  }
  setActiveDateRange([startDraft, key].sort());
  showDateValue();
  closeCalendar(true);
  tablePage = 0;
  render();
});

dayGrid.addEventListener('keydown', event => {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const offset = offsets[event.key];
  const key = event.target.dataset.date;
  if (!offset || !key) return;
  event.preventDefault();
  const date = dateAtUtc(key);
  date.setUTCDate(date.getUTCDate() + offset);
  const next = date.toISOString().slice(0, 10);
  calendarMonth = monthAt(next);
  showCalendarDays(next);
});

$('date-clear').addEventListener('click', () => {
  clearDateRange();
  tablePage = 0;
  render();
});
document.addEventListener('click', event => {
  if (!calendar.hidden && !event.composedPath().includes($('date-filter'))) closeCalendar();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !calendar.hidden) closeCalendar(true);
});
