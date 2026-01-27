import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, addDays, setHours, setMinutes, isBefore } from "date-fns";

const router = Router();

// ⚙️ TORONTO HOURS (in UTC)
// Toronto is UTC-5. So 9 AM EST is 14:00 UTC.
const BUSINESS_START_HOUR = 14; // 9 AM EST
const BUSINESS_END_HOUR = 23;   // 6 PM EST
const SLOT_DURATION = 60;      
const LOOKAHEAD_DAYS = 7;     

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

router.post("/check_availability", async (req, res) => {
  try {
    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    const { date, time } = params as any || {};

    const now = new Date();
    const endSearch = addDays(now, LOOKAHEAD_DAYS);

    const { data: busyData } = await supabase
      .from('appointments')
      .select('start_time')
      .neq('status', 'cancelled')
      .gte('start_time', now.toISOString())
      .lte('start_time', endSearch.toISOString());

    const busyRanges = (busyData || []).map(appt => ({
      start: new Date(appt.start_time),
      end: addMinutes(new Date(appt.start_time), SLOT_DURATION)
    }));

    let resultText = "";

    if (date && time) {
      // User asked for a specific time
      const requestedStart = new Date(`${date} ${time}`);
      // If Vapi sends local time, we might need to assume it's UTC for now or handle timezone parsing
      // For now, we trust Vapi sends an ISO string or we treat it as UTC
      
      const checkStart = new Date(requestedStart.getTime() + 1000); 
      const checkEnd = addMinutes(requestedStart, SLOT_DURATION - 1);
      const isTaken = busyRanges.some(busy => overlaps(checkStart, checkEnd, busy.start, busy.end));
      
      resultText = isTaken ? "That time is unavailable." : "That time is available.";
    } else {
      // FIND SLOTS
      const availableSlots: string[] = [];
      for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
        const currentDay = addDays(now, i);
        // Set hours in UTC
        let slotTime = setHours(setMinutes(currentDay, 0), BUSINESS_START_HOUR);
        const endOfDay = setHours(setMinutes(currentDay, 0), BUSINESS_END_HOUR);

        while (isBefore(slotTime, endOfDay)) {
          const slotEnd = addMinutes(slotTime, SLOT_DURATION);

          if (slotTime > now) {
            const isConflict = busyRanges.some(busy => 
              overlaps(slotTime, slotEnd, busy.start, busy.end)
            );
            if (!isConflict) {
              // Convert back to readable Toronto time for the Voice Response
              // We simulate -5 hours for display
              const localHour = slotTime.getUTCHours() - 5;
              const displayHour = localHour > 12 ? localHour - 12 : localHour;
              const ampm = localHour >= 12 ? "PM" : "AM";
              
              availableSlots.push(
                `${slotTime.toLocaleString("en-US", { weekday: "long" })} at ${displayHour}:00 ${ampm}`
              );
            }
          }
          if (availableSlots.length >= 3) break;
          slotTime = addMinutes(slotTime, SLOT_DURATION);
        }
        if (availableSlots.length >= 3) break;
      }
      resultText = availableSlots.length > 0 
        ? `The next openings are: ${availableSlots.join(", ")}.`
        : "I'm sorry, we are fully booked for the next 7 days.";
    }

    return res.json({
      results: [{
        toolCallId: toolCallId,
        result: resultText
      }]
    });

  } catch (error) {
    console.error("Availability Error:", error);
    return res.json({ 
        results: [{ 
            toolCallId: req.body.message?.toolCalls?.[0]?.id,
            result: "I'm having trouble accessing the calendar." 
        }] 
    });
  }
});

export default router;