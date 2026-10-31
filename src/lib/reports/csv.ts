// CSV building for report exports (RFC 4180). Pure, no framework code.

export type CsvValue = string | number | null | undefined;

/**
 * One CSV cell. Text that a spreadsheet would treat as a formula (=, +, -, @,
 * tab, CR) gets a leading apostrophe; numbers are written as-is.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV line, CRLF-terminated. */
export function csvRow(values: CsvValue[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}

/** `YYYY-MM-DD` for a stored date, or "" when missing. */
export function csvDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/** Money as a plain 2-decimal number so spreadsheets can sum it. */
export function csvMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
