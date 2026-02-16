import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, isBefore, addDays } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const router = Router();

// CONFIG
const OPEN_HOUR = 9;
const CLOSE_HOUR = 19;
const SLOT_DURATION = 60;
const TIMEZONE = "America/Toronto";

// Helper — always know TODAY
function getToday() {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

// Get slots
async function getSlotsForDate(dateStr: string) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error("Invalid date format.");
    }

    const dayStartUtc = fromZonedTime(`${dateStr}T00:00:00`, TIMEZONE);
    const dayEndUtc = fromZonedTime(`${dateStr}T23:59:59`, TIMEZONE);

    const { data: appointments, error } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .neq('status', 'cancelled')
        .gte('start_time', dayStartUtc.toISOString())
        .lte('start_time', dayEndUtc.toISOString());

    if (error) throw new Error(error.message);

    const availableSlots = [];

    let currentSlot = fromZonedTime(
        `${dateStr}T${OPEN_HOUR.toString().padStart(2, '0')}:00:00`,
        TIMEZONE
    );

    const closeTime = fromZonedTime(
        `${dateStr}T${CLOSE_HOUR.toString().padStart(2, '0')}:00:00`,
        TIMEZONE
    );

    while (currentSlot < closeTime) {

        const slotEnd = addMinutes(currentSlot, SLOT_DURATION);

        const isBlocked = appointments?.some(appt => {
            const apptStart = new Date(appt.start_time);
            const apptEnd = new Date(appt.end_time);
            return currentSlot < apptEnd && slotEnd > apptStart;
        });

        const now = new Date();
        const isPast = isBefore(currentSlot, now);

        if (!isBlocked && !isPast) {
            const prettyTime = formatInTimeZone(currentSlot, TIMEZONE, "h:mm a");
            availableSlots.push(prettyTime);
        }

        currentSlot = addMinutes(currentSlot, SLOT_DURATION);
    }

    return availableSlots;
}

router.post("/check_availability", async (req, res) => {

  try {

    console.log("--- SMART AVAILABILITY CHECK ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    const TODAY = getToday();

    // Parse params
    let params = {};
    const rawArgs =
      req.body.message.functionCall?.parameters ||
      req.body.message.toolCalls?.[0]?.function?.arguments;

    if (rawArgs) {
        params = typeof rawArgs === 'string'
            ? JSON.parse(rawArgs)
            : rawArgs;
    }

    let { date, startDateTime } = params as any;

    // Convert ISO if provided
    if (!date && startDateTime) {
        const parsed = new Date(startDateTime);
        if (!isNaN(parsed.getTime())) {
            date = formatInTimeZone(parsed, TIMEZONE, "yyyy-MM-dd");
        }
    }

    // 🔥 CRITICAL FIX — NEVER AUTO-FILL TODAY
    if (!date) {

        // Instead — return the next 3 available days
        const nextAvailableDays = [];

        let searchDate = TODAY;

        for (let i = 0; i < 7; i++) {

            const slots = await getSlotsForDate(searchDate);

            if (slots.length > 0) {
                nextAvailableDays.push(
                  `${searchDate} (${slots[0]} onward)`
                );
            }

            if (nextAvailableDays.length === 3) break;

            const nextDayObj = addDays(
                fromZonedTime(`${searchDate}T00:00:00`, TIMEZONE),
                1
            );

            searchDate = formatInTimeZone(
                nextDayObj,
                TIMEZONE,
                "yyyy-MM-dd"
            );
        }

        return res.json({
            results: [{
                toolCallId,
                result:
                  `To help you faster, I can offer the next available days: ${nextAvailableDays.join(", ")}. Please tell me which date you prefer.`
            }]
        });
    }

    // Validate format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.json({
            results: [{
                toolCallId,
                result:
                  "Please provide the exact date including day and month before checking availability."
            }]
        });
    }

    // 🔥 BLOCK PAST DATES
    if (date < TODAY) {
        return res.json({
            results: [{
                toolCallId,
                result:
                  `That date has already passed. Today is ${TODAY}. Please choose a future date.`
            }]
        });
    }

    console.log(`Checking Date: ${date}`);

    let slots = await getSlotsForDate(date);

    let message = "";

    if (slots.length > 0) {

        message = `I have openings on ${date} at: ${slots.join(", ")}.`;

    } else {

        // check tomorrow ONLY if requested day is today
        if (date === TODAY) {

            const tomorrowObj = addDays(
                fromZonedTime(`${TODAY}T00:00:00`, TIMEZONE),
                1
            );

            const tomorrowStr = formatInTimeZone(
                tomorrowObj,
                TIMEZONE,
                "yyyy-MM-dd"
            );

            const tomorrowSlots = await getSlotsForDate(tomorrowStr);

            if (tomorrowSlots.length > 0) {
                message =
                  `We are fully booked today, but I have openings tomorrow at: ${tomorrowSlots.join(", ")}.`;
            } else {
                message =
                  "We are fully booked for the next two days. Please choose another date.";
            }

        } else {

            message =
              "That day is fully booked. Please choose another date.";
        }
    }

    console.log(`Result: ${message}`);

    return res.json({
        results: [{
            toolCallId,
            result: message
        }]
    });

  } catch (error) {

    console.error("Availability Error:", error);

    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "System error checking availability."
        }]
    });
  }
});

export default router;
