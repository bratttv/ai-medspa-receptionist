import { google } from "googleapis";

const auth = new google.auth.JWT({
  email: process.env.GC_CLIENT_EMAIL,
  key: process.env.GC_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

const calendar = google.calendar({
  version: "v3",
  auth,
});

export async function getAvailability() {
  const now = new Date().toISOString();

  const res = await calendar.events.list({
    calendarId: process.env.GC_CALENDAR_ID,
    timeMin: now,
    maxResults: 5,
    singleEvents: true,
    orderBy: "startTime",
  });

  return res.data.items || [];
}
