// src/services/calendar.service.ts
import { google } from "googleapis";

const auth = new google.auth.JWT({
  email: process.env.GC_CLIENT_EMAIL,
  key: process.env.GC_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/calendar"], 
});

const calendar = google.calendar({
  version: "v3",
  auth,
});

export async function getBusyRanges(timeMin: string, timeMax: string) {
  if (!process.env.GC_CALENDAR_ID) throw new Error("GC_CALENDAR_ID missing");
  
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: process.env.GC_CALENDAR_ID }],
    },
  });
  
  const calendarData = response.data.calendars?.[process.env.GC_CALENDAR_ID];
  return calendarData?.busy || [];
}

export async function createEvent(
  start: string,
  end: string,
  summary: string,
  description: string,
  attendeeEmail?: string
) {
  if (!process.env.GC_CALENDAR_ID) {
    throw new Error("GC_CALENDAR_ID is missing");
  }

  const event: any = {
    summary,
    description,
    start: { dateTime: start },
    end: { dateTime: end },
  };

  if (attendeeEmail) {
    event.attendees = [{ email: attendeeEmail }];
  }

  const response = await calendar.events.insert({
    calendarId: process.env.GC_CALENDAR_ID,
    requestBody: event,
  });

  return response.data;
}