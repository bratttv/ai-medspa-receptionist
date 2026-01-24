import { Router } from "express";
import { getAvailability } from "../services/calendar.service";

const router = Router();

const BUSINESS_START_HOUR = 9;   // 9 AM ET
const BUSINESS_END_HOUR = 17;    // 5 PM ET
const SLOT_MINUTES = 60;
const LOOKAHEAD_DAYS = 7;
const TIMEZONE = "America/New_York";

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

router.post("/availability", async (_req, res) => {
  try {
    const events = await getAvailability();

    // Normalize busy ranges safely
    const busyRanges = events
      .filter(
        e => e.start?.dateTime && e.end?.dateTime
      )
      .map(e => ({
        start: new Date(e.start!.dateTime!),
        end: new Date(e.end!.dateTime!)
      }));

    const now = new Date();
    const availableSlots: string[] = [];

    for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
      const day = new Date(now);
      day.setDate(now.getDate() + dayOffset);
      day.setHours(0, 0, 0, 0);

      // Build business-day window
      const dayStart = new Date(day);
      dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);

      const dayEnd = new Date(day);
      dayEnd.setHours(BUSINESS_END_HOUR, 0, 0, 0);

      for (
        let slotStart = new Date(dayStart);
        slotStart < dayEnd;
        slotStart = new Date(slotStart.getTime() + SLOT_MINUTES * 60 * 1000)
      ) {
        const slotEnd = new Date(
          slotStart.getTime() + SLOT_MINUTES * 60 * 1000
        );

        // Skip past times
        if (slotStart <= now) continue;

        // Ensure slot fits fully in business hours
        if (slotEnd > dayEnd) continue;

        // Check overlap with busy ranges
        const hasConflict = busyRanges.some(busy =>
          overlaps(slotStart, slotEnd, busy.start, busy.end)
        );

        if (!hasConflict) {
          const readable = slotStart.toLocaleString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: TIMEZONE
          });

          availableSlots.push(readable);
        }

        if (availableSlots.length >= 2) break;
      }

      if (availableSlots.length >= 2) break;
    }

    res.json({
      ok: true,
      slots: availableSlots
    });
  } catch (err) {
    console.error("Availability error:", err);
    res.status(500).json({
      ok: false,
      message: "I’m unable to check availability right now."
    });
  }
});

export default router;
