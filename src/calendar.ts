import * as ExpoCalendar from "expo-calendar";
import { Platform } from "react-native";
import { CalendarAddError, CalendarAddResult } from "./calendarTypes";

export { CalendarAddError } from "./calendarTypes";
export type { CalendarAddResult } from "./calendarTypes";

function getCalendarTitle(calendar: ExpoCalendar.Calendar): string {
  const anyCalendar = calendar as any;
  return anyCalendar.title || anyCalendar.name || "Calendar";
}

function pickPreferredAndroidCalendar(
  calendars: ExpoCalendar.Calendar[],
): ExpoCalendar.Calendar | null {
  const writableVisible = calendars.filter(
    (calendar) =>
      calendar.allowsModifications && (calendar as any).isVisible !== false,
  );
  const candidates = writableVisible.length > 0
    ? writableVisible
    : calendars.filter((calendar) => calendar.allowsModifications);
  if (candidates.length === 0) return null;

  const ranked = candidates
    .map((calendar) => {
      const anyCalendar = calendar as any;
      let score = 0;

      if (anyCalendar.isPrimary === true) score += 100;
      if (anyCalendar.isDefault === true) score += 80;
      if (anyCalendar.isVisible !== false) score += 40;
      if (calendar.accessLevel === ExpoCalendar.CalendarAccessLevel.OWNER) {
        score += 20;
      }
      if (typeof anyCalendar.ownerAccount === "string" && anyCalendar.ownerAccount) {
        score += 5;
      }

      return { calendar, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.calendar ?? null;
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

  const permission = await ExpoCalendar.requestCalendarPermissionsAsync();
  if (permission.status !== "granted") {
    throw new CalendarAddError("permission_denied");
  }

  const calendars = await ExpoCalendar.getCalendarsAsync(
    ExpoCalendar.EntityTypes.EVENT,
  );
  const writableCalendars = calendars.filter((calendar) => calendar.allowsModifications);
  let writableCalendar: ExpoCalendar.Calendar | null = null;

  if (writableCalendars.length > 0) {
    if (Platform.OS === "android") {
      writableCalendar = pickPreferredAndroidCalendar(writableCalendars);
    } else {
      // On iOS, prefer the default calendar when it is writable.
      const defaultCalendar = await ExpoCalendar
        .getDefaultCalendarAsync()
        .catch(() => null);
      if (defaultCalendar?.allowsModifications) {
        writableCalendar = defaultCalendar;
      }
      if (!writableCalendar) {
        writableCalendar = writableCalendars[0] ?? null;
      }
    }
  }

  if (!writableCalendar?.id) {
    throw new CalendarAddError("calendar_unavailable");
  }

  const endDate = new Date(
    startDate.getTime() + (input.durationMinutes ?? 120) * 60 * 1000,
  );

  const eventId = await ExpoCalendar.createEventAsync(writableCalendar.id, {
    title: input.title,
    startDate,
    endDate,
    location: input.location ?? undefined,
    notes: input.notes ?? undefined,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // Verify event is queryable after creation, so UI does not show false success.
  const createdEvent = await ExpoCalendar.getEventAsync(eventId).catch(() => null);
  if (!createdEvent?.id) {
    throw new CalendarAddError("event_not_found");
  }

  return {
    kind: "system-calendar",
    eventId,
    calendarId: writableCalendar.id,
    calendarTitle: getCalendarTitle(writableCalendar),
  };
}