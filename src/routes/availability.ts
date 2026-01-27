import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, isBefore, addDays, format } from "date-fns";

const router = Router();

// 🔧 CONFIGURATION
const OPEN_HOUR = 9;   // 9 AM
const CLOSE_HOUR = 17; // 5 PM
const SLOT_DURATION = 60; // 60 Minutes
const TIMEZONE = "America/New_York"; // Toronto Time

// Helper to get slots for a specific date
async function getSlotsForDate(dateStr: string) {
    // 1. Fetch Appointments (Strict Toronto 24h Window)
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .neq('status', 'cancelled')
        .gte('start_time', `${dateStr}T00:00:00-05:00`)
        .lte('start_time', `${dateStr}T23:59:59-05:00`);

    if (error) throw new Error(error.message);

    const availableSlots = [];
    
    // Start at 9:00 AM Toronto Time
    let currentSlot = new Date(`${dateStr}T${OPEN_HOUR.toString().padStart(2, '0')}:00:00-05:00`);
    const closeTime = new Date(`${dateStr}T${CLOSE_HOUR.toString().padStart(2, '0')}:00:00-05:00`);

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
            const prettyTime = currentSlot.toLocaleTimeString("en-US", {
                timeZone: TIMEZONE,
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
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
    
    let { date } = params as any;
    // Default to Today if missing
    if (!date) date = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });

    console.log(`🔎 Checking Date: ${date}`);

    // 2. Check the Requested Date
    let slots = await getSlotsForDate(date);
    let message = "";

    // 3. THE SMART LOGIC (Auto-Switch to Tomorrow) 🧠
    if (slots.length > 0) {
        message = `I have openings on ${date} at: ${slots.join(", ")}.`;
    } else {
        // If today is empty/past, automatically check TOMORROW
        console.log("⚠️ Today is full/past. Auto-checking tomorrow...");
        
        // Calculate Tomorrow's Date
        const todayObj = new Date(date);
        const tomorrowObj = addDays(todayObj, 1);
        const tomorrowStr = format(tomorrowObj, 'yyyy-MM-dd'); // Requires date-fns format

        // Check Tomorrow
        const tomorrowSlots = await getSlotsForDate(tomorrowStr);

        if (tomorrowSlots.length > 0) {
            message = `I am fully booked for today (${date}), but I have openings tomorrow (${tomorrowStr}) at: ${tomorrowSlots.join(", ")}.`;
        } else {
            message = `I am fully booked on ${date} and ${tomorrowStr}. Please choose another date.`;
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