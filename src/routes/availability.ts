import { Router } from "express";
import { getAvailability } from "../services/calendar.service";
import { addMinutes, addDays, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const router = Router();

/**
 * ============================
 * CONFIGURATION
 * ============================
 * Single-provider calendar model
 * (one clinic, one Google Calendar)
 */

const BUSINESS_START_HOUR = Number(process.env.BUSINESS_START_HOUR || 9);  // 9 AM
const BUSINESS_END_HOUR = Number(process.env.BUSINESS_END_HOUR || 17);     // 5 PM
const SLOT_MINUTES = Number(process.env.SLOT_MINUTES || 60);               // 60 min slots
const LOOKAHEAD_DAYS = Number(process.env.LOOKAHEAD_DAYS || 7);             // 7 days forward
const TIMEZONE = process.env.TIMEZONE || "America/New_York";               // Clinic timezone

/**
 * ============================
 * UTILITY
 * ============================
 */

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * ============================
 * ROUTE
 * ============================
 */

router.post("/availability", async (_req, res) => {
  console.log("AVAILABILITY ENDPOINT HIT");

  try {
    /**
     * ---------------------------------
     * 1) Pull calendar events
     * ---------------------------------
     */
    const events = await getAvailability(); // Google Calendar API

    /**
     * ---------------------------------
     * 2) Convert events into busy ranges (UTC)
     * ---------------------------------
     */
    const busyRanges: { start: Date; end: Date }[] = events
      .map((e: any) => {
        // Timed events
        if (e.start?.dateTime && e.end?.dateTime) {
          return {
            start: new Date(e.start.dateTime),
            end: new Date(e.end.dateTime),
          };
        }

        // All-day events
        if (e.start?.date && e.end?.date) {
          const localStart = fromZonedTime(
            `${e.start.date}T00:00:00`,
            TIMEZONE
          );

          const localEnd = fromZonedTime(
            `${e.end.date}T00:00:00`,
            TIMEZONE
          );

          return { start: localStart, end: localEnd };
        }

        return null;
      })
      .filter(Boolean) as { start: Date; end: Date }[];

    /**
     * ---------------------------------
     * 3) Build availability
     * ---------------------------------
     */

    const nowUtc = new Date();
    const availableSlots: string[] = [];

    for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
      // current time in clinic timezone
      const nowZoned = toZonedTime(nowUtc, TIMEZONE);

      // target day in clinic timezone
      const dayZoned = addDays(startOfDay(nowZoned), dayOffset);

      // business hours window
      const businessStartZoned = new Date(dayZoned);
      businessStartZoned.setHours(BUSINESS_START_HOUR, 0, 0, 0);

      const businessEndZoned = new Date(dayZoned);
      businessEndZoned.setHours(BUSINESS_END_HOUR, 0, 0, 0);

      /**
       * Step through slots
       */
      for (
        let slotZoned = businessStartZoned;
        slotZoned < businessEndZoned;
        slotZoned = addMinutes(slotZoned, SLOT_MINUTES)
      ) {
        // Convert slot to UTC for conflict checking
        const slotStartUtc = fromZonedTime(slotZoned, TIMEZONE);
        const slotEndUtc = addMinutes(slotStartUtc, SLOT_MINUTES);

        // Skip past slots
        if (slotEndUtc <= nowUtc) continue;

        // Conflict check
        const conflict = busyRanges.some((busy) =>
          overlaps(slotStartUtc, slotEndUtc, busy.start, busy.end)
        );

        if (!conflict) {
          // Convert back to clinic timezone for speech formatting
          const displayTime = toZonedTime(slotStartUtc, TIMEZONE);

          const readable = displayTime.toLocaleString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: TIMEZONE,
          });

          availableSlots.push(readable);
        }

        // Only return first 2 slots (voice UX)
        if (availableSlots.length >= 2) break;
      }

      if (availableSlots.length >= 2) break;
    }

    /**
     * ---------------------------------
     * 4) Response
     * ---------------------------------
     */
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
