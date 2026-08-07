import { localeFor, type Language } from "./i18n";

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function formatDate(value: number, language: Language) {
  return new Intl.DateTimeFormat(localeFor[language], { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: number, language: Language) {
  return new Intl.DateTimeFormat(localeFor[language], { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Short relative time ("2d ago"). Falls back to an absolute date beyond four weeks. */
export function formatRelative(value: number, language: Language, now = Date.now()) {
  const elapsed = value - now;
  const magnitude = Math.abs(elapsed);
  const relative = new Intl.RelativeTimeFormat(localeFor[language], { numeric: "auto", style: "short" });

  if (magnitude < MINUTE) return relative.format(0, "minute");
  if (magnitude < HOUR) return relative.format(Math.round(elapsed / MINUTE), "minute");
  if (magnitude < DAY) return relative.format(Math.round(elapsed / HOUR), "hour");
  if (magnitude < WEEK) return relative.format(Math.round(elapsed / DAY), "day");
  if (magnitude < 4 * WEEK) return relative.format(Math.round(elapsed / WEEK), "week");
  return formatDate(value, language);
}

export function classes(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}
