export class CalendarAddError extends Error {
  constructor(
    public code:
      | "permission_denied"
      | "calendar_unavailable"
      | "invalid_date"
      | "event_not_found",
  ) {
    super(code);
  }
}

export type CalendarAddResult =
  | {
      kind: "system-calendar";
      eventId: string;
      calendarId: string;
      calendarTitle: string;
    }
  | {
      kind: "download";
      fileName: string;
    };
