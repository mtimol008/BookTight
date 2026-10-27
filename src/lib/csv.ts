// Minimal CSV building for the data-export feature — no library, just
// RFC 4180 quoting plus formula-injection neutralization.

// A cell starting with one of these is a formula to Excel/Sheets/LibreOffice
// when the file is opened (e.g. a customer name of "=cmd|'/c calc'!A1" or a
// description starting with "@SUM(...)"). Prefixing with an apostrophe
// forces it to render as plain text instead of evaluating — the standard
// mitigation for CSV injection, since this data ultimately comes from
// user-entered job/profile fields, not just numbers.
const FORMULA_TRIGGER_CHARS = ["=", "+", "-", "@"];

function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGER_CHARS.includes(value[0]) ? `'${value}` : value;
}

function escapeCell(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return "";
  }
  // Only actual strings get the formula check — a numeric column (e.g. a
  // UK longitude, always negative) stringifies to something starting with
  // "-" too, but it was never free text someone typed, so it's not a
  // credible injection vector and shouldn't be mangled with a stray
  // leading apostrophe.
  const value = typeof raw === "string" ? neutralizeFormula(raw) : String(raw);
  return /["\n\r,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Builds a CSV string (CRLF line endings) from a header row and data rows. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\r\n");
}
