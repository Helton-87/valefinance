const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const count = new Intl.NumberFormat('pt-BR');
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const compare = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare;
const filters = ['month', 'category', 'supplier', 'status'];
const pageSize = 25;
const unknownSupplier = 'Fornecedor sem nome';
const pageTitles = { overview: 'Home', entries: 'Lançamentos', billing: 'Faturamento' };
let overviewMonth = '';
let records = [];
let dateRange = [];
let page = 'overview';
let tablePage = 0;
let toastTimer;

function dateValue(raw, epoch1904) {
  if (!raw) return '';
  const value = raw.trim();
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T| )/);
  const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|\s+\d{1,2}:)/);
  let date;
  if (iso) date = iso[1];
  else if (local) date = [local[3], local[2].padStart(2, '0'), local[1].padStart(2, '0')].join('-');
  else if (/^\d+(?:\.\d+)?$/.test(value) && Number(value) < 1000000) {
    const serial = Number(value);
    const base = epoch1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, serial < 60 ? 31 : 30);
    date = new Date(base + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
  }
  return date && !Number.isNaN(Date.parse(date)) ? date : '';
}

function numeric(raw) {
  const value = raw.replace(/R\$|\s/g, '');
  if (!value) return null;
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function monthValue(raw, date, epoch1904) {
  if (!raw) return date.slice(0, 7);
  const monthYear = raw.match(/^(\d{1,2})[/-](\d{4})$/);
  if (monthYear && +monthYear[1] >= 1 && +monthYear[1] <= 12) return monthYear[2] + '-' + monthYear[1].padStart(2, '0');
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{1,2}$/.test(raw)) return date ? date.slice(0, 4) + '-' + raw.padStart(2, '0') : raw;
  const textMonth = fold(raw).match(/^([a-z]+)(?:[ ./-]*(?:de\s+)?(\d{4}|\d{2}))?\.?$/);
  const aliases = [
    ['jan', 'janeiro', 'january'], ['fev', 'fevereiro', 'feb', 'february'],
    ['mar', 'marco', 'march'], ['abr', 'abril', 'apr', 'april'],
    ['mai', 'maio', 'may'], ['jun', 'junho', 'june'],
    ['jul', 'julho', 'july'], ['ago', 'agosto', 'aug', 'august'],
    ['set', 'setembro', 'sep', 'sept', 'september'], ['out', 'outubro', 'oct', 'october'],
    ['nov', 'novembro', 'november'], ['dez', 'dezembro', 'dec', 'december']
  ];
  const number = textMonth ? aliases.findIndex(names => names.includes(textMonth[1])) + 1 : 0;
  if (number && (textMonth[2] || date)) {
    const year = textMonth[2] || date.slice(0, 4);
    return (year.length === 2 ? '20' + year : year) + '-' + String(number).padStart(2, '0');
  }
  return dateValue(raw, epoch1904).slice(0, 7) || raw;
}

function workbookRecords({ rows, headers, epoch1904 }) {
  const columns = {
    date: ['vencimento', 'datadevencimento', 'data'], month: ['mes', 'competencia'],
    description: ['descricao'], supplier: ['fornecedor', 'nomedofornecedor'], category: ['categoria'], title: ['numerodotitulo', 'titulo'],
    value: ['valorr', 'valor'], paidValue: ['valorpagor', 'valorpago'], paidDate: ['datadopagamento'],
    status: ['status'], code: ['codigodepagamentobarrasoupix', 'codigodepagamento']
  };
  const mapped = Object.fromEntries(Object.entries(columns).map(([field, aliases]) => [field, aliases.map(alias => headers.get(alias)).find(Boolean)]));
  return rows.flatMap(row => {
    const item = Object.fromEntries(Object.entries(mapped).map(([field, column]) => [field, row.get(column) || '']));
    const value = numeric(item.value);
    if (value === null && !item.description && !item.title) return [];
    const date = dateValue(item.date, epoch1904);
    const supplier = item.supplier || (/^fornecedore?s?$/.test(fold(item.category)) ? item.description || unknownSupplier : '');
    const statusKey = fold(item.status);
    const paid = ['pago', 'paga', 'quitado', 'quitada', 'liquidado', 'liquidada'].includes(statusKey) || (!statusKey && Boolean(dateValue(item.paidDate, epoch1904)));
    const pending = ['', 'pendente', 'em aberto', 'aberto', 'a pagar'].includes(statusKey);
    return [{ ...item, value: value ?? 0, date, month: monthValue(item.month, date, epoch1904), supplier,
      category: item.category || 'Sem categoria', status: paid ? 'Pago' : pending ? 'Pendente' : item.status,
      paidValue: numeric(item.paidValue) ?? (paid ? value ?? 0 : 0) }];
  });
}

function currentStatus(item) {
  const today = new Date();
  const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map(value => String(value).padStart(2, '0')).join('-');
  if (/^vencid[oa]$/.test(fold(item.status)) || (item.status === 'Pendente' && item.date && item.date < date)) return 'Vencido';
  return item.status;
}

function amountDue(item) {
  return Math.max(0, item.value - item.paidValue);
}

function labelFor(field, value) {
  if ((field === 'month' || field === 'billing-month') && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return monthFormat.format(new Date(value + '-01T00:00:00Z'));
  return value;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function setOptions() {
  for (const field of filters) {
    const values = [...new Set(records.map(item => field === 'status' ? currentStatus(item) : item[field]).filter(Boolean))].sort(compare);
    const all = { month: 'Todas', category: 'Todas', supplier: 'Todos', status: 'Todos' };
    $(field).replaceChildren(new Option(all[field], ''), ...values.map(value => new Option(labelFor(field, value), value)));
  }
}

function selectedRows() {
  const criteria = filters.map(field => [field, $(field).value]).filter(([, value]) => value);
  const query = fold($('search').value);
  const [start, end] = dateRange;
  return records.filter(item => (!start || (item.date >= start && item.date <= end)) &&
    criteria.every(([field, value]) => (field === 'status' ? currentStatus(item) : item[field]) === value) &&
    (!query || fold([item.title, item.description, item.category, item.supplier].join(' ')).includes(query)));
}

function updateFilter(field, value, toggle = true) {
  if (value && !Array.from($(field).options).some(option => option.value === value)) return;
  $(field).value = toggle && $(field).value === value ? '' : value;
  tablePage = 0;
  render();
}

function summarize(rows) {
  return rows.reduce((total, item) => {
    total.value += item.value;
    total.paid += item.paidValue;
    const status = currentStatus(item);
    if (status === 'Pendente' || status === 'Vencido') total.open += amountDue(item);
    if (status === 'Vencido') total.overdue += amountDue(item);
    return total;
  }, { value: 0, paid: 0, open: 0, overdue: 0 });
}

function grouped(rows, field, chronological = false) {
  const groups = new Map();
  for (const item of rows) {
    const key = field === 'status' ? currentStatus(item) : item[field];
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups].map(([key, items]) => ({ key, items, ...summarize(items) }))
    .sort((a, b) => chronological ? compare(a.key, b.key) : b.value - a.value || compare(a.key, b.key));
}

function chart(title, field, groups, footer = '') {
  const byMonth = field === 'month' || field === 'billing-month';
  const max = Math.max(1, ...groups.map(group => Math.abs(group.value)));
  const bars = groups.map(group => `<button class="bar" data-filter="${field}" data-value="${escapeHtml(group.key)}" aria-pressed="${$(field).value === group.key}">
    <span>${escapeHtml(labelFor(field, group.key))}</span><span class="track" aria-hidden="true"><span class="fill" style="--bar-size:${Math.abs(group.value) / max * 100}%"></span></span><span>${money.format(group.value)}</span>
  </button>`).join('');
  const empty = byMonth
    ? '<div class="period-empty"><p>Sem dados para estes filtros.</p></div>'
    : '<p class="muted">Sem dados para estes filtros.</p>';
  return `<article class="panel ${byMonth ? 'period-panel' : ''}"><h2>${title}</h2>${bars ? '<div class="bars ' + (byMonth ? 'period-bars' : '') + '">' + bars + '</div>' : empty}${footer ? `<p><strong>${escapeHtml(footer)}</strong></p>` : ''}</article>`;
}

function metrics(rows) {
  const total = summarize(rows);
  const cards = [
    ['Despesas a pagar', total.open, ''],
    ['Despesas pagas', total.paid, 'Pago'],
    ['Despesas atrasadas', total.overdue, 'Vencido']
  ];
  return `<div class="metrics overview-metrics">${cards.map(([name, value, status]) =>
    `<article class="metric" data-status="${status}"><small>${name}</small><strong>${money.format(value)}</strong></article>`).join('')}</div>`;
}

function expenseTimeline(rows) {
  const dated = rows.filter(item => item.date);
  const months = grouped(dated.map(item => ({ ...item, dueMonth: item.date.slice(0, 7) })), 'dueMonth', true);
  const selected = months.find(month => month.key === overviewMonth);
  const options = months.map(({ key }) => `<option value="${key}" ${key === overviewMonth ? 'selected' : ''}>${escapeHtml(labelFor('month', key))}</option>`).join('');
  let periods = months.map(({ key, value }) => ({ label: labelFor('month', key), value }));
  if (selected) {
    const [year, month] = selected.key.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const totals = new Map(grouped(selected.items, 'date').map(({ key, value }) => [Number(key.slice(-2)), value]));
    periods = Array.from({ length: days }, (_, index) => ({ label: String(index + 1), value: totals.get(index + 1) ?? 0 }));
  }
  const heading = `<div class="card-heading"><h2>Despesas por vencimento</h2>
    <label>Mês<select id="overview-month"><option value="">Visão mensal</option>${options}</select></label></div>`;
  if (!periods.length) return `<article class="panel timeline">${heading}<p class="muted">Sem lançamentos com vencimento informado.</p></article>`;

  const width = Math.max(560, periods.length * (selected ? 29 : 85) + 120);
  const left = 112;
  const step = (width - left - 12) / periods.length;
  const low = Math.min(0, ...periods.map(period => period.value));
  const high = Math.max(0, ...periods.map(period => period.value)) || (low ? 0 : 1);
  const y = value => 18 + (high - value) / (high - low) * 154;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = high - (high - low) * index / 4;
    const height = y(value);
    return `<line x1="${left}" x2="${width - 8}" y1="${height}" y2="${height}"/><text x="${left - 8}" y="${height}" text-anchor="end" dominant-baseline="middle">${money.format(value)}</text>`;
  }).join('');
  const points = periods.map((period, index) => ({ ...period, x: left + step * (index + .5), y: y(period.value) }));
  const marks = points.map(point => {
    const title = `<title>${escapeHtml(point.label)}: ${money.format(point.value)}</title>`;
    const mark = selected
      ? `<rect x="${point.x - step * .3}" y="${Math.min(point.y, y(0))}" width="${step * .6}" height="${Math.max(1, Math.abs(y(0) - point.y))}" rx="2">${title}</rect>`
      : `<circle cx="${point.x}" cy="${point.y}" r="4">${title}</circle>`;
    return mark + `<text x="${point.x}" y="196" text-anchor="middle">${escapeHtml(point.label)}</text>`;
  }).join('');
  const curve = points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
  const summary = points.map(({ label, value }) => `${label}: ${money.format(value)}`).join(', ');
  return `<article class="panel timeline">${heading}<div class="timeline-scroll" tabindex="0" role="region" aria-label="Gráfico de despesas">
    <svg viewBox="0 0 ${width} 210" style="min-width:${width}px" role="img" aria-label="${escapeHtml(summary)}">
      ${grid}${selected ? '' : `<path d="${curve}"/>`}${marks}
    </svg></div></article>`;
}

function entryTable(rows, title) {
  const ordered = [...rows].sort((a, b) => compare(a.date || '9999', b.date || '9999') || compare(a.title, b.title));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  tablePage = Math.min(tablePage, pages - 1);
  const visible = ordered.slice(tablePage * pageSize, (tablePage + 1) * pageSize);
  const body = visible.map(item => {
    const status = currentStatus(item);
    return `<tr>
      <td class="date">${item.date ? dateFormat.format(new Date(item.date + 'T00:00:00Z')) : '—'}</td>
      <td><button class="cell-button" data-filter="category" data-value="${escapeHtml(item.category)}">${escapeHtml(item.category)}</button></td>
      <td>${item.supplier ? `<button class="cell-button" data-filter="supplier" data-value="${escapeHtml(item.supplier)}">${escapeHtml(item.description || item.supplier)}</button>` : escapeHtml(item.description || '—')}</td>
      <td>${escapeHtml(item.title || '—')}</td><td class="money">${money.format(amountDue(item))}</td>
      <td class="status"><button class="pill cell-button" data-filter="status" data-value="${escapeHtml(status)}">${escapeHtml(status)}</button></td>
      <td>${item.code ? `<button class="copy" data-copy="${escapeHtml(item.code)}" title="Copiar código de pagamento">${escapeHtml(item.code)}</button>` : '—'}</td>
    </tr>`;
  }).join('');
  return `<section class="panel"><div class="card-heading"><h2>${title}</h2><span class="muted">${count.format(rows.length)} registros</span></div>
    <p class="mobile-table-hint">Deslize a tabela para ver mais colunas.</p><div class="table-wrap" tabindex="0" aria-label="Tabela de lançamentos"><table><thead><tr><th>Vencimento</th><th>Categoria</th><th>Descrição</th><th>Nº do título</th><th>Valor a pagar</th><th>Status</th><th>Código de pagamento</th></tr></thead>
    <tbody>${body || '<tr><td colspan="7">Sem lançamentos para estes filtros.</td></tr>'}</tbody></table></div>
    ${pages > 1 ? `<div class="pagination"><button data-step="-1" ${tablePage === 0 ? 'disabled' : ''}>Anterior</button><span>${tablePage + 1} de ${pages}</span><button data-step="1" ${tablePage + 1 === pages ? 'disabled' : ''}>Próxima</button></div>` : ''}
  </section>`;
}

function render() {
  const isBilling = page === 'billing';
  document.body.dataset.page = page;
  $('dashboard-filters').hidden = page === 'overview';
  $('mobile-filter-toggle').hidden = page === 'overview';
  $('extra-filter-count').textContent = ['month', 'status', 'search'].some(field => $(field).value) ? '(ativos)' : '';
  const activeFields = isBilling ? [...billingFilters, 'billing-search'] : [...filters, 'search'];
  const activeRange = isBilling ? billingDateRange : dateRange;
  const filterCount = activeFields.filter(field => $(field).value.trim()).length + Number(activeRange.length === 2);
  $('mobile-filter-count').textContent = filterCount ? count.format(filterCount) + (filterCount === 1 ? ' ativo' : ' ativos') : '';
  $('date-filter').parentElement.classList.toggle('billing-filters', isBilling);
  for (const element of document.querySelectorAll('[data-payables]')) element.hidden = isBilling;
  for (const element of document.querySelectorAll('[data-billing]')) element.hidden = !isBilling;
  $('report-footer').hidden = page !== 'entries';
  $('date-label').textContent = isBilling ? 'Emissão' : 'Vencimento';
  $('date-calendar').setAttribute('aria-label', isBilling ? 'Calendário de emissão' : 'Calendário de vencimentos');
  $('report-export').disabled = !records.length || dateRange.length !== 2;
  $('report-hint').textContent = !records.length ? 'Selecione um período.'
    : dateRange.length !== 2 ? 'Selecione um Período.' : 'Relatório de contas a pagar';
  $('report-files').replaceChildren();
  $('title').textContent = pageTitles[page];
  for (const button of document.querySelectorAll('nav button')) {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (isBilling) {
    $('content').innerHTML = billingView();
    return;
  }
  if (page === 'entries') {
    $('content').innerHTML = entryTable(selectedRows(), 'Lançamentos');
    return;
  }
  $('content').innerHTML = metrics(records) + expenseTimeline(records) +
    '<div class="grid overview-breakdown">' + chart('Total por categoria', 'category', grouped(records, 'category')) +
    chart('Total por fornecedor', 'supplier', grouped(records, 'supplier')) + '</div>';
}

function notify(message) {
  $('toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 3000);
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    notify('Código copiado.');
  } catch {
    const field = document.createElement('textarea');
    field.value = code;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch {}
    field.remove();
    if (success) notify('Código copiado.');
    else window.prompt('Copie o código de pagamento:', code);
  }
}

function resetFilters() {
  const activeFilters = page === 'billing' ? [...billingFilters, 'billing-search'] : [...filters, 'search'];
  for (const field of activeFilters) $(field).value = '';
  clearDateRange();
  tablePage = 0;
  render();
}

const menuToggle = $('menu-toggle');
const mobileMenu = matchMedia('(max-width: 780px)');
function setMenuExpanded(expanded) {
  $('sidebar').hidden = !expanded;
  document.body.classList.toggle('menu-collapsed', !expanded);
  menuToggle.setAttribute('aria-expanded', String(expanded));
  menuToggle.setAttribute('aria-label', expanded ? 'Recolher menu' : 'Abrir menu');
}
setMenuExpanded(!mobileMenu.matches);
mobileMenu.addEventListener('change', event => setMenuExpanded(!event.matches));
menuToggle.addEventListener('click', () => setMenuExpanded($('sidebar').hidden));

$('content').addEventListener('change', event => {
  if (event.target.id !== 'overview-month') return;
  overviewMonth = event.target.value;
  render();
  $('overview-month').focus();
});

document.querySelector('nav').addEventListener('click', event => {
  const button = event.target.closest('[data-page]');
  if (!button) return;
  page = button.dataset.page;
  if (mobileMenu.matches) {
    setMenuExpanded(false);
    menuToggle.focus();
  }
  closeCalendar();
  showDateValue();
  tablePage = 0;
  render();
});
$('content').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { filter, value, copy, step } = button.dataset;
  if (filter) {
    if (page === 'overview') {
      for (const field of [...filters, 'search']) $(field).value = '';
      clearDateRange();
      page = 'entries';
    }
    updateFilter(filter, value);
  }
  else if (copy) copyCode(copy);
  else if (step) { tablePage += Number(step); render(); }
});
for (const field of [...filters, ...billingFilters, 'search', 'billing-search']) {
  $(field).addEventListener(field.endsWith('search') ? 'input' : 'change', () => { tablePage = 0; render(); });
}
$('mobile-filter-toggle').addEventListener('click', event => {
  const button = event.currentTarget;
  const expand = button.getAttribute('aria-expanded') === 'false';
  button.setAttribute('aria-expanded', String(expand));
  if (!expand) closeCalendar();
});
$('clear').addEventListener('click', resetFilters);
$('upload').addEventListener('click', () => $('file').click());
$('resume-dashboard').addEventListener('click', () => {
  document.body.classList.remove('awaiting-workbook');
  window.scrollTo(0, 0);
});

$('file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  $('message').hidden = false;
  $('message').textContent = 'Lendo a planilha…';
  $('welcome-message').hidden = false;
  $('welcome-message').dataset.error = 'false';
  $('welcome-message').textContent = 'Lendo a planilha…';
  $('upload').disabled = true;
  try {
    const workbook = await openExcel(file);
    if (!workbook.payables && !workbook.billing) {
      throw Error('O arquivo não contém as abas esperadas de contas a pagar ou faturamento.');
    }
    const payableRows = workbook.payables ? workbookRecords(workbook.payables) : [];
    const notes = workbook.billing ? workbookBilling(workbook.billing, workbook.items) : [];
    overviewMonth = '';
    records = payableRows;
    billingRecords = notes;
    dateRange = [];
    billingDateRange = [];
    $('search').value = '';
    $('billing-search').value = '';
    $('source').textContent = file.name;
    setOptions();
    setBillingOptions();
    resetFilters();
    const totals = [];
    if (workbook.payables) totals.push(count.format(payableRows.length) + ' lançamentos de contas a pagar');
    if (workbook.billing) totals.push(count.format(notes.length) + ' notas fiscais');
    // Não exibir o resumo técnico de importação no dashboard.
    $('message').hidden = true;
    $('welcome-message').hidden = true;
    $('resume-dashboard').hidden = false;
    document.body.classList.remove('awaiting-workbook');
    window.scrollTo(0, 0);
  } catch (error) {
    $('message').textContent = error instanceof RangeError ? 'Não foi possível ler a estrutura do arquivo Excel.' : error.message || 'Não foi possível importar a planilha.';
    $('welcome-message').hidden = false;
    $('welcome-message').dataset.error = 'true';
    $('welcome-message').textContent = $('message').textContent;
  } finally {
    $('upload').disabled = false;
    event.target.value = '';
  }
});
setOptions();
setBillingOptions();
render();
