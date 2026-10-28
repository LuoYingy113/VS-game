import { CalendarAddError, CalendarAddResult } from "./calendarTypes";

export { CalendarAddError } from "./calendarTypes";
export type { CalendarAddResult } from "./calendarTypes";

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toCalendarDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function addMatchToSystemCalendar(input: {
  title: string;
  startIso: string;
  location?: string | null;
  notes?: string | null;
  durationMinutes?: number;
}): Promise<CalendarAddResult> {
  const startDate = new Date(input.startIso);
  if (!Number.isFinite(startDate.getTime())) {
    throw new CalendarAddError("invalid_date");
  }

  const endDate = new Date(
    startDate.getTime() + (input.durationMinutes ?? 120) * 60 * 1000,
  );
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@team-matcher`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Team Matcher//Match Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toCalendarDate(new Date())}`,
    `DTSTART:${toCalendarDate(startDate)}`,
    `DTEND:${toCalendarDate(endDate)}`,
    `SUMMARY:${escapeCalendarText(input.title)}`,
    ...(input.location ? [`LOCATION:${escapeCalendarText(input.location)}`] : []),
    ...(input.notes ? [`DESCRIPTION:${escapeCalendarText(input.notes)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const fileName = `${input.title.replace(/[^a-z0-9-_]+/gi, "-") || "match"}.ics`;
  const file = new Blob([`${lines.join("\r\n")}\r\n`], {
    type: "text/calendar;charset=utf-8",
  });
  const downloadUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

  return { kind: "download", fileName };
}
