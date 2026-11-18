const reportExport = $('report-export');
const reportFiles = $('report-files');
const reportWidth = 1000;
const ink = '#12254a';
const teal = '#087f8c';
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });
const reportAmount = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let reportUrls = [];
let exportingReport = false;

function reportData(rows, start, end) {
  const dates = new Map();
  let total = 0;
  let entries = 0;
  for (const item of rows) {
    const status = currentStatus(item);
    if (status !== 'Pendente' && status !== 'Vencido') continue;
    const cents = Math.round(amountDue(item) * 100);
    if (cents <= 0) continue;
    if (!dates.has(item.date)) dates.set(item.date, []);
    dates.get(item.date).push({ description: reportDescription(item.description || item.category), cents });
    total += cents;
    entries++;
  }
  const daysInRange = Math.round((dateAtUtc(end) - dateAtUtc(start)) / 86400000) + 1;
  const showEmptyDays = daysInRange <= 31;
  const datesToPrint = showEmptyDays
    ? Array.from({ length: daysInRange }, (_, index) => new Date(+dateAtUtc(start) + index * 86400000).toISOString().slice(0, 10))
    : [...dates.keys()].sort();
  return {
    days: datesToPrint.map(date => ({ date, items: dates.get(date) || [] })),
    total, entries, showEmptyDays
  };
}

function reportDescription(value) {
  const text = value.trim();
  const sentence = text === text.toLocaleUpperCase('pt-BR') ? text.toLocaleLowerCase('pt-BR') : text;
  return sentence.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('pt-BR'));
}

function reportText(ctx, text, x, y, font, color = ink, align = 'left', width) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (width) ctx.fillText(text, x, y, width);
  else ctx.fillText(text, x, y);
}

function drawReportAmount(ctx, cents, y) {
  const font = 'bold 23px Arial';
  reportText(ctx, 'R$', 764, y, font);
  reportText(ctx, reportAmount.format(cents / 100), 926, y, font, ink, 'right', 120);
}

function reportBox(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function reportLines(ctx, value, width) {
  ctx.font = '22px Arial';
  const lines = [''];
  for (const word of value.trim().split(/\s+/)) {
    const last = lines.length - 1;
    const combined = lines[last] ? lines[last] + ' ' + word : word;
    if (lines[last] && ctx.measureText(combined).width > width) lines.push(word);
    else lines[last] = combined;
  }
  return lines;
}

function layoutReport(ctx, days) {
  const pages = [];
  let page = [];
  let pageHeight = 0;
  for (const day of days) {
    const entries = day.items.map(item => {
      const lines = reportLines(ctx, item.description, 460);
      return { ...item, lines, height: Math.max(39, lines.length * 27 + 10) };
    });
    const batches = [];
    let batch = [];
    let batchHeight = 0;
    for (const entry of entries) {
      if (batch.length && batchHeight + entry.height > 2400) {
        batches.push(batch);
        batch = [];
        batchHeight = 0;
      }
      batch.push(entry);
      batchHeight += entry.height;
    }
    batches.push(batch);
    for (const [index, items] of batches.entries()) {
      const height = Math.max(126, 72 + items.reduce((sum, item) => sum + item.height, 0));
      if (page.length && pageHeight + height + 12 > 2800) {
        pages.push(page);
        page = [];
        pageHeight = 0;
      }
      page.push({ date: day.date, items, height, partial: batches.length > 1, part: index + 1 });
      pageHeight += height + 12;
    }
  }
  pages.push(page);
  return pages;
}

function drawReportHeader(ctx, period) {
  ctx.fillStyle = '#d2f2f2';
  ctx.beginPath();
  ctx.ellipse(170, -35, 416, 250, -0.12, 0, 2 * Math.PI);
  ctx.fill();
  reportBox(ctx, 56, 51, 88, 82, 16, '#075965');
  reportBox(ctx, 65, 72, 70, 51, 6, 'white');
  reportBox(ctx, 65, 72, 70, 12, 3, '#9bdedc');
  for (const x of [78, 106]) reportBox(ctx, x, 44, 7, 22, 2, '#12a6ae');
  for (const x of [77, 95, 113]) {
    for (const y of [93, 108]) reportBox(ctx, x, y, 8, 8, 2, teal);
  }
  reportText(ctx, 'RELATÓRIO', 174, 68, 'bold 50px Arial');
  reportText(ctx, 'FINANCEIRO', 174, 120, 'bold 50px Arial', teal);
  reportText(ctx, 'CONTAS A PAGAR  •  BellaNoa', 176, 164, '23px Arial', '#075965');
  reportBox(ctx, 594, 141, 354, 46, 23, teal);
  reportText(ctx, period, 771, 164, 'bold 19px Arial', 'white', 'center', 326);
}

function drawReportDay(ctx, day, y) {
  const date = dateAtUtc(day.date);
  reportBox(ctx, 50, y, 900, day.height, 19, '#ffffff');
  reportBox(ctx, 62, y + 12, 205, day.height - 24, 15, '#d8f3f3');
  reportText(ctx, dateFormat.format(date), 164, y + 43, 'bold 28px Arial', ink, 'center');
  reportText(ctx, weekday.format(date).toUpperCase(), 164, y + 75, 'bold 16px Arial', teal, 'center', 184);
  let lineY = y + 12;
  let subtotal = 0;
  for (const item of day.items) {
    for (const [index, line] of item.lines.entries()) {
      reportText(ctx, line, 287, lineY + 19 + index * 27, '22px Arial', ink, 'left', 460);
    }
    drawReportAmount(ctx, item.cents, lineY + 19);
    lineY += item.height;
    ctx.fillStyle = '#e5efef';
    ctx.fillRect(287, lineY, 639, 1);
    subtotal += item.cents;
  }
  if (!day.items.length) reportText(ctx, 'Sem pendências em aberto', 287, y + 38, 'bold 23px Arial', '#526976');
  const subtotalY = y + day.height - 51;
  reportBox(ctx, 279, subtotalY, 658, 40, 11, '#c5eeee');
  const label = day.partial ? 'Subtotal do dia ' + dayFormat.format(date) + ' – parte ' + day.part : 'Subtotal do dia ' + dayFormat.format(date);
  reportText(ctx, label, 292, subtotalY + 21, 'bold 19px Arial');
  drawReportAmount(ctx, subtotal, subtotalY + 21);
}

function drawReport(canvas, days, data, period, pageNumber, pageCount) {
  canvas.width = reportWidth;
  canvas.height = 215 + days.reduce((sum, day) => sum + day.height + 12, 0) + (days.length ? 0 : 85) + 274;
  const ctx = canvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#f3fafa');
  background.addColorStop(1, '#dcf5f4');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawReportHeader(ctx, period);
  let y = 215;
  for (const day of days) {
    drawReportDay(ctx, day, y);
    y += day.height + 12;
  }
  if (!days.length) {
    reportBox(ctx, 50, y, 900, 70, 15, 'white');
    reportText(ctx, 'Sem pendências em aberto no período', 500, y + 35, 'bold 23px Arial', ink, 'center');
    y += 85;
  }
  reportBox(ctx, 50, y, 900, 151, 21, teal);
  reportText(ctx, 'TOTAL A PAGAR NO PERÍODO', 500, y + 29, 'bold 20px Arial', '#d8f7f6', 'center');
  reportText(ctx, money.format(data.total / 100), 500, y + 81, 'bold 61px Arial', 'white', 'center', 830);
  const entries = count.format(data.entries) + (data.entries === 1 ? ' LANÇAMENTO EM ABERTO' : ' LANÇAMENTOS EM ABERTO');
  reportText(ctx, period + '  •  ' + entries, 500, y + 126, 'bold 17px Arial', '#d8f7f6', 'center', 820);
  if (!data.showEmptyDays && data.entries) reportText(ctx, 'Apenas datas com pendências são exibidas.', 500, y + 172, '15px Arial', '#075965', 'center');
  reportText(ctx, 'BellaNoa', 500, y + 210, '38px Georgia', ink, 'center');
  reportText(ctx, 'MODA INFANTIL E TEEN', 500, y + 246, 'bold 17px Arial', '#075965', 'center');
  if (pageCount > 1) reportText(ctx, pageNumber + ' / ' + pageCount, 948, y + 246, 'bold 16px Arial', '#075965', 'right');
}

reportExport.addEventListener('click', async () => {
  if (exportingReport || !records.length || dateRange.length !== 2) return;
  const [start, end] = dateRange;
  const rows = selectedRows();
  exportingReport = true;
  reportExport.disabled = true;
  reportExport.textContent = 'Gerando imagem…';
  for (const url of reportUrls) URL.revokeObjectURL(url);
  reportUrls = [];
  reportFiles.replaceChildren();
  try {
    const canvas = document.createElement('canvas');
    const data = reportData(rows, start, end);
    const pages = layoutReport(canvas.getContext('2d'), data.days);
    const period = dateFormat.format(dateAtUtc(start)) + ' A ' + dateFormat.format(dateAtUtc(end));
    const links = [];
    for (const [index, days] of pages.entries()) {
      drawReport(canvas, days, data, period, index + 1, pages.length);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('O navegador não conseguiu gerar o PNG.');
      const url = URL.createObjectURL(blob);
      reportUrls.push(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'contas-a-pagar_' + start + '_' + end + (pages.length > 1 ? '_parte-' + (index + 1) : '') + '.png';
      link.textContent = pages.length === 1 ? 'Baixar PNG novamente' : 'Baixar PNG ' + (index + 1) + ' de ' + pages.length;
      links.push(link);
    }
    reportFiles.replaceChildren(...links);
    if (links.length === 1) links[0].click();
    else notify('Relatório dividido em ' + links.length + ' imagens para manter a leitura.');
  } catch (error) {
    notify(error.message || 'Não foi possível gerar a imagem.');
  } finally {
    exportingReport = false;
    reportExport.disabled = !records.length || dateRange.length !== 2;
    reportExport.textContent = 'Exportar imagem para WhatsApp';
  }
});
