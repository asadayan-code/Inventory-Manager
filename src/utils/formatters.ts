/**
 * Money and date formatting utilities.
 * Enforces integer paisa rule in UI logic.
 */

export function formatPKR(paisa: number | null | undefined, includeCurrency: boolean = true): string {
  if (paisa === null || paisa === undefined || isNaN(paisa)) {
    return includeCurrency ? 'PKR 0' : '0';
  }

  const sign = paisa < 0 ? '-' : '';
  const absPaisa = Math.abs(Math.round(paisa));
  const rupees = Math.floor(absPaisa / 100);
  const remainder = absPaisa % 100;

  const rupeesFormatted = rupees.toLocaleString('en-US');
  let result = '';
  if (remainder > 0) {
    result = `${sign}${rupeesFormatted}.${remainder.toString().padStart(2, '0')}`;
  } else {
    result = `${sign}${rupeesFormatted}`;
  }

  return includeCurrency ? `PKR ${result}` : result;
}

export function pkrToPaisa(pkrInput: string | number): number {
  if (typeof pkrInput === 'number') {
    return Math.round(pkrInput * 100);
  }

  const clean = pkrInput.trim().replace(/,/g, '');
  if (!clean) return 0;

  const parts = clean.split('.');
  if (parts.length === 1) {
    return (parseInt(parts[0], 10) || 0) * 100;
  }

  const whole = parseInt(parts[0], 10) || 0;
  const fractionStr = parts[1].padEnd(2, '0').slice(0, 2);
  const fraction = parseInt(fractionStr, 10) || 0;

  return whole * 100 + fraction;
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function formatDate(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoString;
  }
}
