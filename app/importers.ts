const pdfWorkerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

export type ImportCurrency = 'PEN' | 'USD';
export type ImportFormat = 'bcp_pdf' | 'csv' | 'xlsx';

export type ParsedImportRow = {
  id: string;
  externalId?: string;
  processDate: string;
  valueDate?: string;
  description: string;
  originalDescription: string;
  merchant: string;
  category: string;
  account: string;
  currency: ImportCurrency;
  signedAmountMinor: number;
  included: boolean;
  duplicate: boolean;
  review: boolean;
  issues: string[];
};

export type ImportPreviewData = {
  filename: string;
  format: ImportFormat;
  sourceLabel: string;
  rows: ParsedImportRow[];
  account?: string;
  currency?: ImportCurrency;
  periodStart?: string;
  periodEnd?: string;
  openingBalanceMinor?: number;
  closingBalanceMinor?: number;
  totalDebitsMinor: number;
  totalCreditsMinor: number;
  reconciled: boolean;
  reconcileMessage: string;
};

export class ImportFileError extends Error {
  code: 'PASSWORD_REQUIRED' | 'PASSWORD_INCORRECT' | 'UNSUPPORTED' | 'INVALID_FILE';

  constructor(code: ImportFileError['code'], message: string) {
    super(message);
    this.name = 'ImportFileError';
    this.code = code;
  }
}

const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
};

const DATE_CODES = new Set(Object.keys(MONTHS));
const MAX_FILE_BYTES = 30 * 1024 * 1024;

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function asText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function findColumn(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const exact = headers.indexOf(candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of candidates) {
    const partial = headers.findIndex((header) => header.includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

function parseDecimalMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);

  let text = String(value).trim();
  const negative = text.startsWith('(') && text.endsWith(')');
  text = text.replace(/[()\sA-Za-z$€£S/]/g, '');
  if (!text) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let decimalSeparator = '';
  if (lastComma >= 0 && lastDot >= 0) decimalSeparator = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0 && /,\d{1,4}$/.test(text)) decimalSeparator = ',';
  else if (lastDot >= 0 && /\.\d{1,4}$/.test(text)) decimalSeparator = '.';

  let normalized = text;
  if (decimalSeparator === ',') normalized = text.replace(/\./g, '').replace(',', '.');
  else if (decimalSeparator === '.') normalized = text.replace(/,/g, '');
  else normalized = text.replace(/[.,]/g, '');

  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const sign = match[1] === '-' || negative ? -1 : 1;
  const whole = Number(match[2]);
  const decimals = (match[3] ?? '').padEnd(3, '0');
  let cents = Number(decimals.slice(0, 2));
  if (Number(decimals[2] ?? '0') >= 5) cents += 1;
  const minor = whole * 100 + cents;
  return sign * minor;
}

function formatIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }

  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return formatIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dayFirst = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})/);
  if (dayFirst) {
    const year = Number(dayFirst[3]) < 100 ? 2000 + Number(dayFirst[3]) : Number(dayFirst[3]);
    return formatIsoDate(year, Number(dayFirst[2]), Number(dayFirst[1]));
  }
  return '';
}

function normalizeCurrency(value: unknown): ImportCurrency | null {
  const text = normalizeHeader(value).toUpperCase();
  if (text.includes('USD') || text.includes('DOLAR')) return 'USD';
  if (text.includes('PEN') || text.includes('SOL')) return 'PEN';
  return null;
}

function rowSignature(row: Pick<ParsedImportRow, 'account' | 'processDate' | 'signedAmountMinor' | 'originalDescription'> & { currency: string }) {
  return [
    normalizeHeader(row.account),
    row.processDate,
    row.signedAmountMinor,
    row.currency,
    normalizeHeader(row.originalDescription),
  ].join('|');
}

export { rowSignature };

async function sha256(value: string | Uint8Array) {
  const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const copied = new Uint8Array(data.byteLength);
  copied.set(data);
  const digest = await crypto.subtle.digest('SHA-256', copied.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function detectDelimiter(text: string) {
  const firstRecord = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstRecord.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

type Cell = string | number | boolean | Date | null;

async function buildTabularPreview(filename: string, format: 'csv' | 'xlsx', sourceRows: Cell[][], sourceLabel: string): Promise<ImportPreviewData> {
  const headerRowIndex = sourceRows.slice(0, 20).findIndex((row) => {
    const headers = row.map(normalizeHeader);
    const hasDate = findColumn(headers, ['date', 'fecha', 'date requested', 'process date']) >= 0;
    const hasAmount = findColumn(headers, ['signed amount pen', 'signed amount', 'account amount', 'transaction amount', 'amount', 'monto', 'debit', 'debe', 'credit', 'haber', 'original amount']) >= 0;
    return hasDate && hasAmount;
  });
  if (headerRowIndex < 0) {
    throw new ImportFileError('INVALID_FILE', 'No pudimos identificar las columnas de fecha y monto. Usa encabezados en la primera fila.');
  }

  const headers = sourceRows[headerRowIndex].map(normalizeHeader);
  const dateIndex = findColumn(headers, ['date', 'fecha', 'date requested', 'process date', 'fecha proceso']);
  const valueDateIndex = findColumn(headers, ['value date', 'fecha valor']);
  const signedIndex = findColumn(headers, ['signed amount pen', 'signed amount', 'account amount', 'accountamount', 'transaction amount', 'monto', 'amount']);
  const originalAmountIndex = findColumn(headers, ['original amount']);
  const debitIndex = findColumn(headers, ['debit', 'debe', 'cargo', 'outflow', 'egreso']);
  const creditIndex = findColumn(headers, ['credit', 'haber', 'abono', 'inflow', 'ingreso']);
  const directionIndex = findColumn(headers, ['direction', 'direccion', 'tipo movimiento']);
  const currencyIndex = findColumn(headers, ['account currency', 'accountcurrency', 'original currency', 'currency', 'moneda']);
  const accountIndex = findColumn(headers, ['account code', 'account', 'cuenta', 'card last 4', 'last4']);
  const idIndex = findColumn(headers, ['transaction id', 'external tx id', 'externaltxid', 'external id', 'id']);
  const categoryIndex = findColumn(headers, ['category normalized', 'category', 'categoria', 'mcc label']);
  const statusIndex = findColumn(headers, ['transaction status', 'status', 'estado']);
  const descriptionIndexes = [
    findColumn(headers, ['merchant normalized']),
    findColumn(headers, ['merchant name', 'merchantname']),
    findColumn(headers, ['merchant raw']),
    findColumn(headers, ['description', 'descripcion']),
    findColumn(headers, ['client']),
    findColumn(headers, ['transaction type']),
  ].filter((index, position, list) => index >= 0 && list.indexOf(index) === position);

  if (descriptionIndexes.length === 0) {
    throw new ImportFileError('INVALID_FILE', 'No pudimos identificar una columna de descripción o comercio.');
  }

  const rawRows = sourceRows.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ''));
  const rows = await Promise.all(rawRows.map(async (source, index) => {
    const issues: string[] = [];
    const processDate = parseDate(source[dateIndex]);
    if (!processDate) issues.push('Fecha inválida');

    let signedAmountMinor: number | null = null;
    if (debitIndex >= 0 || creditIndex >= 0) {
      const debit = debitIndex >= 0 ? parseDecimalMinor(source[debitIndex]) : null;
      const credit = creditIndex >= 0 ? parseDecimalMinor(source[creditIndex]) : null;
      if (debit !== null && debit !== 0) signedAmountMinor = -Math.abs(debit);
      else if (credit !== null) signedAmountMinor = Math.abs(credit);
    }
    if (signedAmountMinor === null && signedIndex >= 0) signedAmountMinor = parseDecimalMinor(source[signedIndex]);
    if (signedAmountMinor === null && originalAmountIndex >= 0) signedAmountMinor = parseDecimalMinor(source[originalAmountIndex]);
    if (signedAmountMinor === null) {
      issues.push('Monto inválido');
      signedAmountMinor = 0;
    }

    const direction = directionIndex >= 0 ? normalizeHeader(source[directionIndex]) : '';
    if (/debit|cargo|gasto|egreso/.test(direction)) signedAmountMinor = -Math.abs(signedAmountMinor);
    if (/credit|abono|ingreso/.test(direction)) signedAmountMinor = Math.abs(signedAmountMinor);

    const description = descriptionIndexes.map((column) => asText(source[column])).find(Boolean) ?? '';
    if (!description) issues.push('Descripción vacía');
    const currency = currencyIndex >= 0 ? normalizeCurrency(source[currencyIndex]) : null;
    if (!currency) issues.push('Moneda no identificada');
    const status = statusIndex >= 0 ? normalizeHeader(source[statusIndex]) : '';
    const declined = /declined|failed|rejected|cancel/.test(status);
    if (declined) issues.push('Operación no completada');
    let category = categoryIndex >= 0 ? asText(source[categoryIndex]) : '';
    const ambiguousTransfer = /\b(YAPE|PLIN)\b/i.test(description);
    if (ambiguousTransfer) {
      category = 'Por revisar';
      issues.push('Transferencia Yape/PLIN por confirmar');
    }
    const account = accountIndex >= 0 ? asText(source[accountIndex]) : sourceLabel;
    const externalId = idIndex >= 0 ? asText(source[idIndex]) : undefined;
    const fingerprint = externalId || `${account}|${processDate}|${signedAmountMinor}|${description}|${index}`;

    return {
      id: await sha256(fingerprint),
      externalId,
      processDate,
      valueDate: valueDateIndex >= 0 ? parseDate(source[valueDateIndex]) || undefined : undefined,
      description,
      originalDescription: description,
      merchant: description,
      category: category || 'Por revisar',
      account: account || sourceLabel,
      currency: currency || 'PEN',
      signedAmountMinor,
      included: !declined && !issues.some((issue) => issue === 'Fecha inválida' || issue === 'Monto inválido' || issue === 'Descripción vacía'),
      duplicate: false,
      review: !category || ambiguousTransfer || issues.length > 0,
      issues,
    } satisfies ParsedImportRow;
  }));

  const totalDebitsMinor = rows.reduce((sum, row) => sum + (row.signedAmountMinor < 0 ? Math.abs(row.signedAmountMinor) : 0), 0);
  const totalCreditsMinor = rows.reduce((sum, row) => sum + (row.signedAmountMinor > 0 ? row.signedAmountMinor : 0), 0);
  return {
    filename,
    format,
    sourceLabel,
    rows,
    totalDebitsMinor,
    totalCreditsMinor,
    reconciled: true,
    reconcileMessage: 'Columnas detectadas. Revisa las filas antes de confirmar.',
  };
}

function findByteSequence(bytes: Uint8Array, sequence: Uint8Array, fromEnd = false) {
  if (fromEnd) {
    for (let index = bytes.length - sequence.length; index >= 0; index -= 1) {
      if (sequence.every((byte, offset) => bytes[index + offset] === byte)) return index;
    }
  } else {
    for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
      if (sequence.every((byte, offset) => bytes[index + offset] === byte)) return index;
    }
  }
  return -1;
}

function normalizePdfBytes(raw: Uint8Array) {
  const start = findByteSequence(raw, new TextEncoder().encode('%PDF-'));
  const eofBytes = new TextEncoder().encode('%%EOF');
  const end = findByteSequence(raw, eofBytes, true);
  if (start < 0 || end < 0 || end <= start) throw new ImportFileError('INVALID_FILE', 'El archivo no contiene un PDF reconocible.');
  return raw.slice(start, end + eofBytes.length);
}

type PdfLineItem = { x: number; y: number; text: string };
type PdfLine = { y: number; items: PdfLineItem[]; text: string };

function groupPdfLines(items: PdfLineItem[]) {
  const lines: { y: number; items: PdfLineItem[] }[] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 4);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => {
      const sorted = line.items.sort((a, b) => a.x - b.x);
      return { ...line, items: sorted, text: sorted.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim() } satisfies PdfLine;
    });
}

function parsePeriodDate(value: string) {
  const [day, month, year] = value.split('/').map(Number);
  return formatIsoDate(2000 + year, month, day);
}

function resolveBcpDate(value: string, periodStart: string, periodEnd: string) {
  const day = Number(value.slice(0, 2));
  const monthCode = value.slice(2).toUpperCase();
  if (!DATE_CODES.has(monthCode)) return '';
  const month = MONTHS[monthCode];
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const candidates = [start.getUTCFullYear() - 1, start.getUTCFullYear(), end.getUTCFullYear(), end.getUTCFullYear() + 1]
    .map((year) => formatIsoDate(year, month, day))
    .filter(Boolean);
  return candidates.sort((left, right) => {
    const distance = (candidate: string) => {
      const date = new Date(`${candidate}T00:00:00Z`).getTime();
      if (date < start.getTime()) return start.getTime() - date;
      if (date > end.getTime()) return date - end.getTime();
      return 0;
    };
    return distance(left) - distance(right);
  })[0] ?? '';
}

function moneyFromLine(line: PdfLine) {
  return line.items
    .filter((item) => /^[\d,]+\.\d{2}$/.test(item.text.trim()))
    .map((item) => ({ item, minor: parseDecimalMinor(item.text) }))
    .filter((entry): entry is { item: PdfLineItem; minor: number } => entry.minor !== null);
}

async function parseBcpPdf(file: File, password?: string): Promise<ImportPreviewData> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const data = normalizePdfBytes(raw);
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  let document;
  try {
    document = await pdfjs.getDocument({ data, password: password || undefined, isEvalSupported: false }).promise;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === pdfjs.PasswordResponses.NEED_PASSWORD) throw new ImportFileError('PASSWORD_REQUIRED', 'Este estado está protegido. Ingresa la contraseña para leerlo.');
    if (code === pdfjs.PasswordResponses.INCORRECT_PASSWORD) throw new ImportFileError('PASSWORD_INCORRECT', 'La contraseña no es correcta. Inténtalo nuevamente.');
    throw new ImportFileError('INVALID_FILE', 'No pudimos abrir este PDF. Verifica que sea un estado de cuenta BCP válido.');
  }

  const pageLines: PdfLine[][] = [];
  const allParts: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PdfLineItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      allParts.push(item.str);
      items.push({ x: item.transform[4], y: item.transform[5], text: item.str.trim() });
    }
    pageLines.push(groupPdfLines(items));
  }
  await document.destroy();

  const allText = allParts.join(' ').replace(/\s+/g, ' ');
  const accountMatch = allText.match(/(\d{3}-\d{8}-\d-\d{2})\s+(SOLES|US\s+DOLARES)/i);
  const periodMatch = allText.match(/DEL\s+(\d{2}\/\d{2}\/\d{2})\s+AL\s+(\d{2}\/\d{2}\/\d{2})/i);
  if (!accountMatch || !periodMatch) throw new ImportFileError('UNSUPPORTED', 'El PDF no parece ser un Estado de Cuenta de Ahorros BCP compatible.');

  const account = accountMatch[1];
  const currency: ImportCurrency = /SOLES/i.test(accountMatch[2]) ? 'PEN' : 'USD';
  const periodStart = parsePeriodDate(periodMatch[1]);
  const periodEnd = parsePeriodDate(periodMatch[2]);
  const flatLines = pageLines.flat();
  const openingLine = flatLines.find((line) => /SALDO ANTERIOR/i.test(line.text));
  const closingLine = [...flatLines].reverse().find((line) => /^SALDO\b/i.test(line.text) && !/ANTERIOR/i.test(line.text));
  const totalsLine = [...flatLines].reverse().find((line) => /TOTAL MOVIMIENTO/i.test(line.text));
  const opening = openingLine ? moneyFromLine(openingLine).at(-1)?.minor : undefined;
  const closing = closingLine ? moneyFromLine(closingLine).at(-1)?.minor : undefined;
  const printedTotals = totalsLine ? moneyFromLine(totalsLine) : [];
  if (opening === undefined || closing === undefined || printedTotals.length < 2) {
    throw new ImportFileError('INVALID_FILE', 'No pudimos leer los saldos o totales impresos del estado.');
  }

  const parsedRows: Omit<ParsedImportRow, 'id'>[] = [];
  pageLines.forEach((lines) => lines.forEach((line) => {
    const first = line.items[0]?.text.toUpperCase();
    const second = line.items[1]?.text.toUpperCase();
    if (!/^\d{2}[A-Z]{3}$/.test(first ?? '') || !/^\d{2}[A-Z]{3}$/.test(second ?? '')) return;
    const money = moneyFromLine(line).at(-1);
    if (!money) return;
    const moneyIndex = line.items.indexOf(money.item);
    const description = line.items.slice(2, moneyIndex).map((item) => item.text).filter((text) => text !== '*').join(' ').replace(/\s+/g, ' ').trim();
    if (!description) return;
    const signedAmountMinor = money.item.x > 450 ? Math.abs(money.minor) : -Math.abs(money.minor);
    parsedRows.push({
      externalId: undefined,
      processDate: resolveBcpDate(first, periodStart, periodEnd),
      valueDate: resolveBcpDate(second, periodStart, periodEnd),
      description,
      originalDescription: description,
      merchant: description,
      category: 'Por revisar',
      account,
      currency,
      signedAmountMinor,
      included: true,
      duplicate: false,
      review: true,
      issues: [],
    });
  }));
  if (parsedRows.length === 0) throw new ImportFileError('INVALID_FILE', 'No encontramos movimientos en el estado BCP.');

  const rows = await Promise.all(parsedRows.map(async (row) => ({
    ...row,
    id: await sha256(`${account}|${row.processDate}|${row.valueDate}|${row.originalDescription}|${row.signedAmountMinor}`),
  })));
  const totalDebitsMinor = rows.reduce((sum, row) => sum + (row.signedAmountMinor < 0 ? Math.abs(row.signedAmountMinor) : 0), 0);
  const totalCreditsMinor = rows.reduce((sum, row) => sum + (row.signedAmountMinor > 0 ? row.signedAmountMinor : 0), 0);
  const printedDebitsMinor = printedTotals[0].minor;
  const printedCreditsMinor = printedTotals[1].minor;
  const calculatedClosing = opening - totalDebitsMinor + totalCreditsMinor;
  const reconciled = totalDebitsMinor === printedDebitsMinor && totalCreditsMinor === printedCreditsMinor && calculatedClosing === closing;

  return {
    filename: file.name,
    format: 'bcp_pdf',
    sourceLabel: `BCP ${account.slice(-2)} ${currency}`,
    rows,
    account,
    currency,
    periodStart,
    periodEnd,
    openingBalanceMinor: opening,
    closingBalanceMinor: closing,
    totalDebitsMinor,
    totalCreditsMinor,
    reconciled,
    reconcileMessage: reconciled
      ? `Balance conciliado: saldo inicial − débitos + créditos = saldo final.`
      : `El estado no cuadra. Leído: débitos ${totalDebitsMinor}, créditos ${totalCreditsMinor}, saldo ${calculatedClosing}; impreso: débitos ${printedDebitsMinor}, créditos ${printedCreditsMinor}, saldo ${closing}.`,
  };
}

export async function parseImportFile(file: File, password?: string): Promise<ImportPreviewData> {
  if (file.size > MAX_FILE_BYTES) throw new ImportFileError('INVALID_FILE', 'El archivo supera el límite de 30 MB.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return parseBcpPdf(file, password);
  if (extension === 'csv') {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    const rows = parseDelimited(text, detectDelimiter(text));
    return buildTabularPreview(file.name, 'csv', rows, 'Archivo CSV');
  }
  if (extension === 'xlsx') {
    const { default: readXlsxFile, readSheetNames } = await import('read-excel-file');
    const sheetNames = await readSheetNames(file);
    const preferred = sheetNames.find((name) => normalizeHeader(name) === 'transactions clean') ?? sheetNames[0];
    if (!preferred) throw new ImportFileError('INVALID_FILE', 'El libro de Excel no contiene hojas.');
    const rows = await readXlsxFile(file, { sheet: preferred });
    return buildTabularPreview(file.name, 'xlsx', rows as Cell[][], `Excel · ${preferred}`);
  }
  throw new ImportFileError('UNSUPPORTED', 'Formato no compatible. Usa PDF, CSV o XLSX.');
}
