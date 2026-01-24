import { Router } from "express";
import { getAvailability } from "../services/calendar.service";

import { addMinutes, addDays, startOfDay, setHours, setMinutes } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const router = Router();

/**
 * CONFIG — single provider, simple + real
 */
const BUSINESS_START_HOUR = 9;   // 9 AM
const BUSINESS_END_HOUR = 17;    // 5 PM
const SLOT_MINUTES = 60;
const LOOKAHEAD_DAYS = 7;
const TIMEZONE = "America/New_York";

/**
 * Overlap check
 */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

router.post("/availability", async (_req, res) => {
  console.log("AVAILABILITY ENDPOINT HIT");

  try {
    const events = await getAvailability();

    /**
     * Convert Google events → busy ranges (UTC)
     */
    const busyRanges = events
      .map((e) => {
        // Timed events
        if (e.start?.dateTime && e.end?.dateTime) {
          return {
            start: new Date(e.start.dateTime),
            end: new Date(e.end.dateTime),
          };
        }

        // All-day events (treat as full-day busy)
        if (e.start?.date && e.end?.date) {
          const startUtc = fromZonedTime(
            `${e.start.date}T00:00:00`,
            TIMEZONE
          );
          const endUtc = fromZonedTime(
            `${e.end.date}T00:00:00`,
            TIMEZONE
          );
          return { start: startUtc, end: endUtc };
        }

        return null;
      })
      .filter(Boolean) as { start: Date; end: Date }[];

    const nowUtc = new Date();
    const availableSlots: string[] = [];

    /**
     * Iterate days
     */
    for (let d = 0; d < LOOKAHEAD_DAYS; d++) {
      const nowZoned = toZonedTime(nowUtc, TIMEZONE);
      const dayZoned = addDays(startOfDay(nowZoned), d);

      let slotZoned = setMinutes(setHours(dayZoned, BUSINESS_START_HOUR), 0);
      const endOfDayZoned = setMinutes(
        setHours(dayZoned, BUSINESS_END_HOUR),
        0
      );

      /**
       * Iterate slots within the day
       */
      while (slotZoned < endOfDayZoned) {
        const slotStartUtc = fromZonedTime(slotZoned, TIMEZONE);
        const slotEndUtc = addMinutes(slotStartUtc, SLOT_MINUTES);

        // Skip past times
        if (slotEndUtc <= nowUtc) {
          slotZoned = addMinutes(slotZoned, SLOT_MINUTES);
          continue;
        }

        const conflict = busyRanges.some((busy) =>
          overlaps(slotStartUtc, slotEndUtc, busy.start, busy.end)
        );

        if (!conflict) {
          availableSlots.push(
            slotZoned.toLocaleString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZone: TIMEZONE,
            })
          );
        }

        if (availableSlots.length >= 2) break;

        slotZoned = addMinutes(slotZoned, SLOT_MINUTES);
      }

      if (availableSlots.length >= 2) break;
    }

    return res.json({
      ok: true,
      slots: availableSlots,
    });
  } catch (err) {
    console.error("Availability error:", err);
    return res.status(500).json({
      ok: false,
      message: "Unable to check availability",
    });
  }
});

export default router;
