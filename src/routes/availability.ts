import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, isBefore, addDays } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

const router = Router();

// 🔧 CONFIGURATION
const OPEN_HOUR = 9;   // 9 AM
const CLOSE_HOUR = 17; // 5 PM
const SLOT_DURATION = 60; // 60 Minutes
const TIMEZONE = "America/Toronto";

// Helper to get slots for a specific date
async function getSlotsForDate(dateStr: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error("Invalid date format. Use YYYY-MM-DD.");
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
    
    // Start at 9:00 AM Toronto Time
    let currentSlot = fromZonedTime(`${dateStr}T${OPEN_HOUR.toString().padStart(2, '0')}:00:00`, TIMEZONE);
    const closeTime = fromZonedTime(`${dateStr}T${CLOSE_HOUR.toString().padStart(2, '0')}:00:00`, TIMEZONE);
    while (currentSlot < closeTime) {
        const slotEnd = addMinutes(currentSlot, SLOT_DURATION);

        // Collision Detection
        const isBlocked = appointments?.some(appt => {
            const apptStart = new Date(appt.start_time);
            const apptEnd = new Date(appt.end_time);
            return (currentSlot < apptEnd && slotEnd > apptStart);
        });

        // Past Time Check
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

    // 1. Parse Date
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    let { date, startDateTime } = params as any;
    if (!date && startDateTime) {
        const startDate = new Date(startDateTime);
        if (isNaN(startDate.getTime())) {
            return res.json({
                results: [{
                    toolCallId: toolCallId,
                    result: "Please provide a valid startDateTime (ISO 8601)."
                }]
            });
        }
        date = formatInTimeZone(startDate, TIMEZONE, "yyyy-MM-dd");
    }
    if (!date) date = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return res.json({
            results: [{
                toolCallId: toolCallId,
                result: "Please provide the exact date in YYYY-MM-DD (e.g. 2026-02-01)."
            }]
        });
    }

    console.log(`🔎 Checking Date: ${date}`);

    // 2. Check Requested Date
    let slots = await getSlotsForDate(date);
    let message = "";

    // 3. SMART LOGIC (Auto-Switch) 🧠
    if (slots.length > 0) {
        // Normal success case
        message = `I have openings on ${date} at: ${slots.join(", ")}.`;
    } else {
        // Today is full/past -> Check Tomorrow
        console.log("⚠️ Today is full/past. Auto-checking tomorrow...");
        
        const todayObj = fromZonedTime(`${date}T00:00:00`, TIMEZONE);
        const tomorrowObj = addDays(todayObj, 1);
        const tomorrowStr = formatInTimeZone(tomorrowObj, TIMEZONE, "yyyy-MM-dd");
        const tomorrowSlots = await getSlotsForDate(tomorrowStr);

        if (tomorrowSlots.length > 0) {
            // 👈 YOUR NEW CUSTOM MESSAGE IS HERE
            message = `We can't get you in today, but I have openings tomorrow at: ${tomorrowSlots.join(", ")}.`;
        } else {
            message = `I am fully booked for the next two days. Please choose another date.`;
        }
    }

    console.log(`✅ Result: ${message}`);

    return res.json({
        results: [{
            toolCallId: toolCallId,
            result: message
        }]
    });

  } catch (error: any) {
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