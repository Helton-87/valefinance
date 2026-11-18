const billingFilters = ['billing-month', 'billing-model', 'billing-operation', 'billing-status', 'billing-recipient', 'billing-product', 'billing-city'];
const billingQuantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });
const unidentifiedClient = 'Cliente não identificado';
let billingRecords = [];
let billingDateRange = [];

function billingItems(sheet) {
  const items = new Map();
  if (!sheet) return items;
  const { rows, headers } = sheet;
  const quantityColumn = headers.get('quantidade');
  for (const row of rows) {
    const key = row.get(headers.get('chavedeacesso'));
    const product = row.get(headers.get('descricaodoproduto'));
    const value = numeric(row.get(headers.get('valorproduto')) || '');
    if (!key || !product) continue;
    const quantity = numeric(row.get(quantityColumn) || '');
    if (!items.has(key)) items.set(key, []);
    items.get(key).push({ product, value, quantity });
  }
  return items;
}

function workbookBilling({ rows, headers, epoch1904 }, itemSheet) {
  const items = billingItems(itemSheet);
  const cityColumn = ['cidadedodestinatario', 'cidadedestinatario', 'cidadedestinatarionfe', 'cidadedodestinatarionfe', 'municipiododestinatario', 'municipiodestinatario', 'cidade', 'municipio']
    .find(label => headers.has(label));
  const stateColumn = ['ufdodestinatario', 'ufdestinatario', 'ufdestinatarionfe', 'ufdodestinatarionfe', 'uf'].find(label => headers.has(label));
  const columns = {
    date: 'emissao', model: 'modelo', number: 'nnota', operation: 'operacao',
    status: 'situacao', recipient: 'destinatario', month: 'mes', key: 'chavedeacesso',
    city: cityColumn, state: stateColumn,
    value: headers.has('valortotal') ? 'valortotal' : 'valortotalr'
  };
  return rows.flatMap(row => {
    const note = Object.fromEntries(Object.entries(columns).map(([field, label]) => [field, row.get(headers.get(label)) || '']));
    const date = dateValue(note.date, epoch1904);
    const value = numeric(note.value);
    if ((!date && !note.number) || value === null) return [];
    return [{ ...note, date, month: date.slice(0, 7) || monthValue(note.month, date, epoch1904),
      model: note.model || 'Sem modelo', operation: note.operation || 'Sem operação',
      status: note.status || 'Sem situação', recipient: note.recipient || unidentifiedClient,
      city: ['nfe', '55'].includes(excelKey(note.model)) ? [note.city, note.city && note.state].filter(Boolean).join(' / ') : '', items: items.get(note.key) || [], value }];
  });
}

function setBillingOptions() {
  const labels = ['Todas', 'Todos', 'Todas', 'Todas', 'Todos', 'Todos', 'Todas'];
  for (const [index, field] of billingFilters.entries()) {
    const key = field.slice('billing-'.length);
    const values = [...new Set(billingRecords.flatMap(note => key === 'product' ? note.items.map(item => item.product) : [note[key]]).filter(Boolean))].sort(compare);
    const unavailable = (key === 'product' || key === 'city') && !values.length;
    $(field).disabled = unavailable;
    $(field).replaceChildren(new Option(unavailable ? 'Sem dados na base' : labels[index], ''), ...values.map(value => new Option(labelFor(field, value), value)));
  }
}

function selectedBillingRows() {
  const [start, end] = billingDateRange;
  const criteria = billingFilters.map(field => [field.slice('billing-'.length), $(field).value]).filter(([, value]) => value);
  const query = fold($('billing-search').value);
  return billingRecords.filter(note => (!start || (note.date >= start && note.date <= end)) &&
    criteria.every(([key, value]) => key === 'product' ? note.items.some(item => item.product === value) : note[key] === value) &&
    (!query || fold(`${note.number} ${note.recipient}`).includes(query)));
}

function billingTotals(rows) {
  let gross = 0;
  let returns = 0;
  let sales = 0;
  const product = $('billing-product').value;
  for (const note of rows) {
    const direction = billingDirection(note);
    if (!direction) continue;
    const cents = product
      ? note.items.filter(item => item.product === product).reduce((total, item) => total + billingCents(item.value), 0)
      : billingCents(note.value);
    if (direction > 0) { gross += cents; sales++; }
    else returns += cents;
  }
  return { gross: gross / 100, returns: returns / 100, net: (gross - returns) / 100, average: sales ? gross / sales / 100 : 0 };
}

function billingDirection(note) {
  if (fold(note.status) !== 'autorizada') return 0;
  const operation = fold(note.operation);
  return operation === 'venda' ? 1 : operation === 'devolucao de venda' ? -1 : 0;
}

const billingCents = value => Math.round(Math.abs(value) * 100);

function billingGroups(rows, field, metric = 'net') {
  const groups = new Map();
  for (const note of rows) {
    const key = note[field];
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  return [...groups].sort(([a], [b]) => compare(a, b))
    .map(([key, notes]) => ({ key, value: billingTotals(notes)[metric] }));
}

function billingTopTen(title, field, groups) {
  const ranked = groups.filter(group => group.value > 0)
    .sort((a, b) => b.value - a.value || compare(a.key, b.key)).slice(0, 10);
  const total = ranked.reduce((sum, group) => sum + Math.round(group.value * 100), 0) / 100;
  return chart(title, field, ranked, 'Soma do ranking: ' + money.format(total));
}

function billingView() {
  const rows = selectedBillingRows();
  const { gross, returns, net, average } = billingTotals(rows);
  const product = $('billing-product').value;
  const metrics = [
    ['Faturamento líquido', money.format(net), product ? 'Valor líquido do produto selecionado' : 'Vendas menos devoluções'],
    ['Faturamento bruto', money.format(gross), 'Vendas autorizadas'],
    ['Devoluções de venda', money.format(returns), 'Devoluções autorizadas'],
    ['Notas fiscais', count.format(rows.length), 'Notas no filtro'],
    ['Ticket médio', money.format(average), product ? 'Valor do produto por nota de venda' : 'Valor por nota de venda']
  ];
  const cards = metrics.map(([label, value, detail]) => `<article class="metric"><small>${label}</small><strong>${value}</strong><span>${detail}</span></article>`).join('');
  const rank = groups => groups.sort((a, b) => b.value - a.value || compare(a.key, b.key)).slice(0, 8);
  const cities = billingRecords.some(note => note.city);
  const products = billingRecords.some(note => note.items.length);
  const cityView = cities ? chart('Faturamento por cidade (NF-e)', 'billing-city', rank(billingGroups(rows, 'city')), 'Somente NF-e com cidade informada.')
    : '<article class="panel"><h2>Faturamento por cidade</h2><p class="muted">Adicione a coluna Cidade do destinatário na aba NOTAS_FISCAIS para visualizar os valores por cidade.</p></article>';
  const productView = products ? billingTopTen('10 produtos com maior valor de compra', 'billing-product', billingProductGroups(rows, product))
    : '<article class="panel"><h2>Faturamento por produto</h2><p class="muted">Importe a aba ITENS_VENDIDOS com a chave de acesso das notas.</p></article>';
  return `<div class="metrics billing-metrics">${cards}</div><div class="grid overview-charts">${chart('Faturamento líquido por mês', 'billing-month', billingGroups(rows, 'month'))}
    ${chart('Faturamento líquido por modelo', 'billing-model', billingGroups(rows, 'model'))}</div>
    <div class="grid">${billingTopTen('10 clientes com maior valor de compra', 'billing-recipient',
      billingGroups(rows.filter(note => note.recipient !== unidentifiedClient), 'recipient', 'gross'))}${productView}</div>
    <div class="grid">${cityView}</div>${billingTable(rows, cities, product)}`;
}

function billingProductGroups(rows, product) {
  const totals = new Map();
  for (const note of rows) {
    if (billingDirection(note) !== 1) continue;
    for (const item of note.items) {
      if (item.value === null || (product && item.product !== product)) continue;
      totals.set(item.product, (totals.get(item.product) || 0) + billingCents(item.value));
    }
  }
  return [...totals].map(([key, cents]) => ({ key, value: cents / 100 }));
}

function billingTable(rows, cities, product) {
  const ordered = [...rows].sort((a, b) => compare(a.date || '9999', b.date || '9999') || compare(a.number, b.number));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  tablePage = Math.min(tablePage, pages - 1);
  const body = ordered.slice(tablePage * pageSize, (tablePage + 1) * pageSize).flatMap(note => {
    const items = product ? note.items.filter(item => item.product === product) : note.items;
    return (items.length ? items : [null]).map(item => `<tr>
    <td class="date">${note.date ? dateFormat.format(new Date(note.date + 'T00:00:00Z')) : '—'}</td>
    <td>${escapeHtml(note.number || '—')}</td><td>${escapeHtml(note.model)}</td>
    <td>${escapeHtml(note.recipient)}</td>${cities ? `<td>${escapeHtml(note.city || '—')}</td>` : ''}<td>${escapeHtml(note.operation)}</td>
    <td>${escapeHtml(note.status)}</td><td>${escapeHtml(item?.product || '—')}</td>
    <td class="money">${item?.quantity == null ? '—' : billingQuantity.format(item.quantity)}</td>
    <td class="money">${item?.value == null ? '—' : money.format(item.value)}</td>
  </tr>`);
  }).join('');
  return `<section class="panel"><div class="card-heading"><h2>Notas fiscais</h2><span class="muted">${count.format(rows.length)} registros</span></div>
    <p class="mobile-table-hint">Deslize a tabela para ver mais colunas.</p><div class="table-wrap" tabindex="0" aria-label="Tabela de notas fiscais"><table><thead><tr><th aria-sort="ascending">Emissão</th><th>Nº da nota</th><th>Modelo</th><th>Destinatário</th>${cities ? '<th>Cidade</th>' : ''}<th>Operação</th><th>Situação</th><th>Produto</th><th>Quantidade</th><th>Valor do produto</th></tr></thead>
    <tbody>${body || `<tr><td colspan="${cities ? 10 : 9}">Sem notas fiscais para estes filtros.</td></tr>`}</tbody></table></div>
    ${pages > 1 ? `<div class="pagination"><button data-step="-1" ${tablePage === 0 ? 'disabled' : ''}>Anterior</button><span>${tablePage + 1} de ${pages}</span><button data-step="1" ${tablePage + 1 === pages ? 'disabled' : ''}>Próxima</button></div>` : ''}
  </section>`;
}
