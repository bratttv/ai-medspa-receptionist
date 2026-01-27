import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, isBefore } from "date-fns";

const router = Router();

// 🔧 CONFIGURATION
const OPEN_HOUR = 9;   // 9 AM
const CLOSE_HOUR = 17; // 5 PM
const SLOT_DURATION = 60; // 60 Minutes (Change to 30 if you want half-hour slots)
const TIMEZONE = "America/New_York"; // Toronto Time

router.post("/check_availability", async (req, res) => {
  try {
    console.log("--- PREMIUM AVAILABILITY CHECK ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    // 1. Parse Date
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    let { date } = params as any;
    if (!date) {
        // Default to "Today" in Toronto
        date = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
    }

    console.log(`🔎 Checking Date: ${date}`);

    // 2. Fetch Appointments (Strict Toronto 24h Window)
    // The -05:00 ensures we look at the correct day in your database
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .neq('status', 'cancelled')
        .gte('start_time', `${date}T00:00:00-05:00`)
        .lte('start_time', `${date}T23:59:59-05:00`);

    if (error) throw new Error(error.message);

    // 3. Generate Slots
    const availableSlots = [];
    
    // 🛑 CRITICAL: Start at 9:00 AM Toronto Time
    // We explicitly add "-05:00" so the server knows exactly when to start.
    let currentSlot = new Date(`${date}T${OPEN_HOUR.toString().padStart(2, '0')}:00:00-05:00`);
    
    // Stop at 5:00 PM Toronto Time
    const closeTime = new Date(`${date}T${CLOSE_HOUR.toString().padStart(2, '0')}:00:00-05:00`);

    // Loop until we hit closing time
    while (currentSlot < closeTime) {
        
        const slotEnd = addMinutes(currentSlot, SLOT_DURATION);

        // A. Collision Detection (Does it overlap with DB?)
        const isBlocked = appointments?.some(appt => {
            const apptStart = new Date(appt.start_time);
            const apptEnd = new Date(appt.end_time);
            // Overlap Formula
            return (currentSlot < apptEnd && slotEnd > apptStart);
        });

        // B. Past Time Check (Don't show 9 AM if it is now 2 PM)
        const now = new Date();
        const isPast = isBefore(currentSlot, now);

        if (!isBlocked && !isPast) {
            // C. Pretty Format ("9:00 AM")
            const prettyTime = currentSlot.toLocaleTimeString("en-US", {
                timeZone: TIMEZONE,
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            availableSlots.push(prettyTime);
        }

        // Move to next slot
        currentSlot = addMinutes(currentSlot, SLOT_DURATION);
    }

    console.log(`✅ Slots Found: ${availableSlots.length}`);

    // 4. Return to Vapi
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