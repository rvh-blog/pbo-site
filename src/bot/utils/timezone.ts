export interface CalendarDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function getNumberPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

export function getZonedDateTime(
  date: Date,
  timeZone: string
): CalendarDateTime & { second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: getNumberPart(parts, "year"),
    month: getNumberPart(parts, "month"),
    day: getNumberPart(parts, "day"),
    hour: getNumberPart(parts, "hour"),
    minute: getNumberPart(parts, "minute"),
    second: getNumberPart(parts, "second"),
  };
}

export function getTimeZoneOffsetLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  if (raw === "GMT") return "UTC+00:00";
  return raw.replace("GMT", "UTC").replace("-", "−");
}

export function zonedDateTimeToUtc(
  local: CalendarDateTime,
  timeZone: string
): Date | null {
  const wanted = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    0
  );
  let candidate = wanted;

  // Offset iteration uses Intl's timezone database, including historical and
  // future daylight-saving transitions.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = getZonedDateTime(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second
    );
    const adjustment = wanted - representedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const result = new Date(candidate);
  const final = getZonedDateTime(result, timeZone);
  return final.year === local.year &&
    final.month === local.month &&
    final.day === local.day &&
    final.hour === local.hour &&
    final.minute === local.minute
    ? result
    : null;
}

export function isValidCalendarDate(
  year: number,
  month: number,
  day: number
): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}

export function addCalendarDays(
  date: Pick<CalendarDateTime, "year" | "month" | "day">,
  days: number
): Pick<CalendarDateTime, "year" | "month" | "day"> {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function formatCalendarDate(
  date: Pick<CalendarDateTime, "year" | "month" | "day">,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day, 12)));
}
