import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, isBefore } from "date-fns";

const router = Router();

// 🔧 CONFIGURATION
const OPEN_HOUR = 9;   // 9 AM
const CLOSE_HOUR = 17; // 5 PM
const SLOT_DURATION = 60; // 👈 Set to 60 for 1-hour slots (or 30 for half-hour)

router.post("/check_availability", async (req, res) => {
  try {
    console.log("--- AVAILABILITY CHECK (TORONTO FORCED) ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    // 1. Parse Date
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    let { date } = params as any;
    if (!date) {
        // Default to Today (Toronto Date)
        date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    }

    console.log(`🔎 Checking Date: ${date}`);

    // 2. Fetch Appointments (Toronto 24h Window)
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .neq('status', 'cancelled')
        .gte('start_time', `${date}T00:00:00-05:00`)
        .lte('start_time', `${date}T23:59:59-05:00`);

    if (error) throw new Error(error.message);

    // 3. Generate Slots (FORCE TORONTO OFFSET) 🇨🇦
    const availableSlots = [];
    
    // We construct the ISO string WITH the timezone offset (-05:00)
    // This tells the UTC server: "This is 9 AM in Toronto, which is 2 PM for you."
    let currentSlot = new Date(`${date}T${OPEN_HOUR.toString().padStart(2, '0')}:00:00-05:00`);
    const closeTime = new Date(`${date}T${CLOSE_HOUR.toString().padStart(2, '0')}:00:00-05:00`);

    // Loop through the day
    while (currentSlot < closeTime) {
        
        const slotStart = currentSlot;
        const slotEnd = addMinutes(slotStart, SLOT_DURATION);

        // A. Collision Detection
        const isBlocked = appointments?.some(appt => {
            const apptStart = new Date(appt.start_time); // DB is already ISO
            const apptEnd = new Date(appt.end_time);
            return (slotStart < apptEnd && slotEnd > apptStart);
        });

        // B. Past Time Check (Is this slot in the past?)
        const now = new Date(); // Current UTC time
        const isPast = isBefore(slotStart, now);

        if (!isBlocked && !isPast) {
            // C. Formatting (Clean "9:00 AM")
            const prettyTime = slotStart.toLocaleTimeString("en-US", {
                timeZone: "America/New_York",
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            availableSlots.push(prettyTime);
        }

        // Next Slot
        currentSlot = addMinutes(currentSlot, SLOT_DURATION);
    }

    console.log(`✅ Slots Found: ${availableSlots.length}`);

    // 4. Return
    return res.json({
        results: [{
            toolCallId: toolCallId,
            result: availableSlots.length > 0 
                ? `I have openings on ${date} at: ${availableSlots.join(", ")}.` 
                : `I am fully booked on ${date}.`
        }]
    });

  } catch (error: any) {
    console.error("Availability Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "I'm having trouble seeing the calendar."
        }]
    });
  }
});

export default router;