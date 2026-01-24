import { google } from "googleapis";

const CLIENT_EMAIL = process.env.GC_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GC_PRIVATE_KEY ? process.env.GC_PRIVATE_KEY.replace(/\\n/g, "\n") : undefined;
const CALENDAR_ID = process.env.GC_CALENDAR_ID;

if (!CLIENT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
  // don't throw here — let callers handle. But log to help debugging.
  console.warn("Calendar service: missing GC_CLIENT_EMAIL, GC_PRIVATE_KEY or GC_CALENDAR_ID");
}

const auth = new google.auth.JWT({
  email: CLIENT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

const calendar = google.calendar({ version: "v3", auth });

/**
 * Returns the freebusy response (busy time ranges) between timeMin and timeMax
 * items: [{ id: calendarId }]
 */
export async function getBusyRanges(timeMinIso: string, timeMaxIso: string) {
  if (!CLIENT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
    throw new Error("Calendar configuration missing (CLIENT_EMAIL / PRIVATE_KEY / CALENDAR_ID).");
  }

  const request = {
    requestBody: {
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: CALENDAR_ID }],
    },
  };

  const res = await calendar.freebusy.query(request);
  // res.data.calendars[CALENDAR_ID].busy -> array of {start, end}
  const cal = (res.data.calendars && res.data.calendars[CALENDAR_ID]) || null;
  if (!cal) {
    // something odd — return empty
    return [];
  }
  return cal.busy || [];
}
