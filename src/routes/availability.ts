import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

// 💎 PREMIUM CONFIGURATION
const OPEN_HOUR = 9;  // 9:00 AM
const CLOSE_HOUR = 17; // 5:00 PM (Last slot will be 4:00 PM)
const TIMEZONE = "America/New_York";

router.post("/check_availability", async (req, res) => {
  try {
    console.log("--- PREMIUM AVAILABILITY CHECK ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    // 1. Precise Parsing
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    let { date } = params as any;
    if (!date) {
        date = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE }); // Defaults to Today in Toronto
    }

    console.log(`🔎 Checking Date: ${date}`);

    // 2. Fetch Busy Slots from Supabase
    // Uses strict Toronto offsets to ensure we get the right 24h window
    const { data: busySlots, error } = await supabase
        .from('appointments')
        .select('start_time')
        .neq('status', 'cancelled')
        .gte('start_time', `${date}T00:00:00-05:00`)
        .lte('start_time', `${date}T23:59:59-05:00`);

    if (error) throw new Error(error.message);

    // 3. Generate & Filter Slots (The Premium Logic) 🧠
    const availableSlots = [];
    const now = new Date(); // Current time in UTC
    
    // Check if the requested date is "Today"
    // We compare the YYYY-MM-DD strings to be sure
    const todayString = now.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
    const isToday = date === todayString;

    // Get current hour in Toronto (for "Past Time" filtering)
    const currentHourToronto = parseInt(now.toLocaleTimeString("en-US", { timeZone: TIMEZONE, hour12: false, hour: 'numeric' }));

    // Loop through business hours (9, 10, ... 16)
    for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
        
        // A. Past Time Check (If it's Today + 3 PM, don't show 10 AM)
        if (isToday && h <= currentHourToronto) {
            continue; // Skip this slot
        }

        // B. Formatting (14 -> "14:00")
        // We use this strictly for matching against the DB
        const slotTime24 = `${h.toString().padStart(2, '0')}:00`;
        
        // C. Busy Check
        // Does any appointment in the DB start at this time?
        const isTaken = busySlots?.some(appt => {
            const apptTime = new Date(appt.start_time).toLocaleTimeString("en-US", { 
                timeZone: TIMEZONE, 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            return apptTime === slotTime24;
        });

        if (!isTaken) {
            // D. Pretty Output ("2:00 PM")
            // We convert the 24h time to AM/PM for the AI to speak beautifully
            const prettyTime = new Date(`2000-01-01T${slotTime24}:00`).toLocaleTimeString("en-US", {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            availableSlots.push(prettyTime);
        }
    }

    console.log(`✅ Final Openings: ${availableSlots.join(", ")}`);

    // 4. Smart Response
    if (availableSlots.length === 0) {
        return res.json({
            results: [{
                toolCallId: toolCallId,
                result: `I'm sorry, I don't have any openings left on ${date}.`
            }]
        });
    }

    return res.json({
        results: [{
            toolCallId: toolCallId,
            result: `I have the following times available on ${date}: ${availableSlots.join(", ")}.`
        }]
    });

  } catch (error: any) {
    console.error("Availability Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "I'm having trouble seeing the calendar right now."
        }]
    });
  }
});

export default router;