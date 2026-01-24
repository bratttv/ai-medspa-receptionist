import { google } from "googleapis";

/**
 * Create JWT auth using service account
 */
const auth = new google.auth.JWT({
  email: process.env.GC_CLIENT_EMAIL,
  key: process.env.GC_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

/**
 * Calendar client
 */
const calendar = google.calendar({
  version: "v3",
  auth,
});

/**
 * Get busy ranges using FreeBusy API
 */
export async function getBusyRanges(timeMin: string, timeMax: string) {
  if (!process.env.GC_CALENDAR_ID) {
    throw new Error("GC_CALENDAR_ID is missing");
  }

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: process.env.GC_CALENDAR_ID }],
    },
  });

  const calendarData =
    response.data.calendars?.[process.env.GC_CALENDAR_ID];

  if (!calendarData || !calendarData.busy) {
    return [];
  }

  return calendarData.busy;
}
