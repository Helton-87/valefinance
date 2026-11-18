// Read the workbook XML directly so files stay in the browser.
const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const excelKey = value => fold(value).replace(/[^a-z0-9]/g, '');

async function openExcel(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  const decoder = new TextDecoder();
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) &&
    (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < Math.max(0, bytes.length - 65557)) throw Error('Selecione um arquivo Excel .xlsx ou .xlsm válido e sem senha.');
  const parts = new Map();
  let offset = u32(end + 16);
  for (let index = 0; index < u16(end + 10); index++) {
    if (u32(offset) !== 0x02014b50) throw Error('A estrutura do arquivo Excel está inválida.');
    const length = u16(offset + 28);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + length));
    parts.set(name, { method: u16(offset + 10), size: u32(offset + 20), local: u32(offset + 42) });
    offset += 46 + length + u16(offset + 30) + u16(offset + 32);
  }
  async function xml(name, optional = false) {
    const part = parts.get(name);
    if (!part && optional) return null;
    if (!part || u32(part.local) !== 0x04034b50) throw Error('A estrutura do arquivo Excel está incompleta.');
    const start = part.local + 30 + u16(part.local + 26) + u16(part.local + 28);
    const data = bytes.subarray(start, start + part.size);
    let content;
    if (part.method === 0) content = decoder.decode(data);
    else if (part.method === 8) {
      if (!globalThis.DecompressionStream) throw Error('Abra o painel em uma versão atual do Chrome, Edge ou Firefox para importar Excel.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      content = await new Response(stream).text();
    } else throw Error('Salve a planilha novamente como .xlsx ou .xlsm.');
    const document = new DOMParser().parseFromString(content, 'application/xml');
    if (document.querySelector('parsererror')) throw Error('Uma parte do Excel contém XML inválido.');
    return document;
  }
  const nodes = (element, name) => Array.from(element?.getElementsByTagNameNS('*', name) ?? []);
  const [workbook, relations, shared] = await Promise.all([
    xml('xl/workbook.xml'), xml('xl/_rels/workbook.xml.rels'), xml('xl/sharedStrings.xml', true)
  ]);
  const plainText = element => nodes(element, 't').filter(node => node.parentElement.localName !== 'rPh')
    .map(node => node.textContent).join('');
  const strings = nodes(shared, 'si').map(plainText);
  const epoch1904 = ['1', 'true'].includes(nodes(workbook, 'workbookPr')[0]?.getAttribute('date1904'));
  async function readSheet(name, hasHeaders) {
    const sheet = nodes(workbook, 'sheet').find(item => excelKey(item.getAttribute('name')) === excelKey(name));
    if (!sheet) return null;
    const relationId = Array.from(sheet.attributes).find(attribute => attribute.localName === 'id')?.value;
    const target = nodes(relations, 'Relationship').find(relation => relation.getAttribute('Id') === relationId)?.getAttribute('Target');
    if (!target) throw Error('Não foi possível localizar os dados da aba ' + name + '.');
    const path = new URL(target, 'https://excel.invalid/xl/workbook.xml').pathname.slice(1);
    const detail = await xml(path);
    const rows = nodes(detail, 'row').map(row => {
      const cells = new Map();
      for (const cell of nodes(row, 'c')) {
        const column = cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
        if (!column) continue;
        const type = cell.getAttribute('t');
        const raw = nodes(cell, 'v')[0]?.textContent ?? '';
        const value = type === 's' ? strings[Number(raw)] : type === 'inlineStr' ? plainText(cell) : raw;
        if (type !== 'e' && value?.trim()) cells.set(column, value.trim());
      }
      return cells;
    });
    const headerIndex = rows.findIndex(row => {
      const labels = Array.from(row.values(), excelKey);
      return hasHeaders(labels);
    });
    if (headerIndex < 0) throw Error('Confira os cabeçalhos da aba ' + name + '.');
    const headers = new Map(Array.from(rows[headerIndex], ([column, label]) => [excelKey(label), column]));
    return { rows: rows.slice(headerIndex + 1), headers, epoch1904 };
  }
  const [payables, billing, items] = await Promise.all([
    readSheet('CONTAS_A_PAGAR', labels => labels.includes('descricao') && labels.some(label => ['valor','valorr','valorpago','valorpagor'].includes(label))),
    readSheet('NOTAS_FISCAIS', labels => ['emissao','modelo','operacao','situacao'].every(label => labels.includes(label)) &&
      labels.some(label => ['valortotal','valortotalr'].includes(label))),
    readSheet('ITENS_VENDIDOS', labels => ['chavedeacesso', 'descricaodoproduto', 'valorproduto'].every(label => labels.includes(label)))
  ]);
  if (!payables && !billing) throw Error('A planilha precisa ter a aba CONTAS_A_PAGAR ou NOTAS_FISCAIS.');
  return { payables, billing, items };
}
