import { Router } from "express";
import { getBusyRanges } from "../services/calendar.service";
import { addMinutes, addDays } from "date-fns";

const router = Router();

// config
const BUSINESS_START_HOUR = Number(process.env.BUSINESS_START_HOUR || 9);
const BUSINESS_END_HOUR = Number(process.env.BUSINESS_END_HOUR || 17);
const SLOT_MINUTES = Number(process.env.SLOT_MINUTES || 60);
const LOOKAHEAD_DAYS = Number(process.env.LOOKAHEAD_DAYS || 7);

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

router.post("/availability", async (_req, res) => {
  console.log("AVAILABILITY ENDPOINT HIT");

  try {
    const now = new Date();
    const end = addDays(now, LOOKAHEAD_DAYS);

    // Get busy ranges (UTC ISO strings)
    const busy = await getBusyRanges(
      now.toISOString(),
      end.toISOString()
    );

    const busyRanges = busy.map((b: any) => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));

    const slots: string[] = [];

    for (let dayOffset = 0; dayOffset < LOOKAHEAD_DAYS; dayOffset++) {
      const dayBase = addDays(now, dayOffset);

      const dayStart = new Date(dayBase);
      dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);

      const dayEnd = new Date(dayBase);
      dayEnd.setHours(BUSINESS_END_HOUR, 0, 0, 0);

      for (
        let slotStart = new Date(dayStart);
        slotStart < dayEnd;
        slotStart = addMinutes(slotStart, SLOT_MINUTES)
      ) {
        const slotEnd = addMinutes(slotStart, SLOT_MINUTES);

        if (slotEnd <= now) continue;

        const conflict = busyRanges.some(busy =>
          overlaps(slotStart, slotEnd, busy.start, busy.end)
        );

        if (!conflict) {
          slots.push(
            slotStart.toLocaleString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          );
        }

        if (slots.length >= 2) break;
      }

      if (slots.length >= 2) break;
    }

    if (slots.length === 0) {
      return res.status(200).json({
        ok: false,
        message: "No availability found",
      });
    }

    return res.status(200).json({
      ok: true,
      slots,
    });

  } catch (err) {
    console.error("Availability error:", err);
    return res.status(200).json({
      ok: false,
      message: "Unable to check availability",
    });
  }
});

export default router;
