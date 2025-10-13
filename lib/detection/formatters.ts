export type DetectionTimestampInput = string | number | Date;

const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

const DEFAULT_LOCALE_RESOLVER = (locale?: string | string[]) =>
  locale ? (Array.isArray(locale) ? locale : [locale]) : undefined;

/**
 * Formats a detection timestamp for display in the UI.
 * - Same-day timestamps show the localised time only (HH:MM)
 * - Older timestamps show the localised date and time separated by a bullet
 * - Invalid timestamps fall back to the raw input string.
 */
export function formatDetectionTimestamp(
  value: DetectionTimestampInput,
  locale?: string | string[]
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    if (typeof value === 'string') {
      return value;
    }

    return String(value);
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const localeList = DEFAULT_LOCALE_RESOLVER(locale);

  if (sameDay) {
    return date.toLocaleTimeString(localeList, TIME_FORMAT_OPTIONS);
  }

  const datePart = date.toLocaleDateString(localeList);
  const timePart = date.toLocaleTimeString(localeList, TIME_FORMAT_OPTIONS);
  return `${datePart} • ${timePart}`;
}
