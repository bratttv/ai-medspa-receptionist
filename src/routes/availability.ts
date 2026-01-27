import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, addDays, setHours, setMinutes, isBefore } from "date-fns";

const router = Router();

// ⚙️ CONFIGURATION
const BUSINESS_START_HOUR = 9; // 9 AM
const BUSINESS_END_HOUR = 17;  // 5 PM
const SLOT_DURATION = 60;      // Minutes per appointment
const LOOKAHEAD_DAYS = 7;      // How far to look

// Helper: Check overlap
function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

router.post("/check_availability", async (req, res) => {
  try {
    // 1. Get parameters (Safe Parse for Vapi)
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    const { date, time } = params as any || {};
    console.log(`Checking availability... Date: ${date}, Time: ${time}`);

    // 2. Fetch busy slots
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

    // 3. IF USER REQUESTED A TIME
    if (date && time) {
      const requestedStart = new Date(`${date} ${time}`);
      const checkStart = new Date(requestedStart.getTime() + 1000); 
      const checkEnd = addMinutes(requestedStart, SLOT_DURATION - 1);

      const isTaken = busyRanges.some(busy => overlaps(checkStart, checkEnd, busy.start, busy.end));

      if (!isTaken) {
        return res.json({ results: [{ result: "That time is available." }] });
      }
      console.log("Requested time is busy. Finding alternatives...");
    }

    // 4. FIND OPEN SLOTS
    const availableSlots: string[] = [];
    for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
      const currentDay = addDays(now, i);
      let slotTime = setHours(setMinutes(currentDay, 0), BUSINESS_START_HOUR);
      const endOfDay = setHours(setMinutes(currentDay, 0), BUSINESS_END_HOUR);

      while (isBefore(slotTime, endOfDay)) {
        const slotEnd = addMinutes(slotTime, SLOT_DURATION);

        if (slotTime > now) {
          const isConflict = busyRanges.some(busy => 
            overlaps(slotTime, slotEnd, busy.start, busy.end)
          );
          if (!isConflict) {
            availableSlots.push(
              slotTime.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })
            );
          }
        }
        if (availableSlots.length >= 3) break;
        slotTime = addMinutes(slotTime, SLOT_DURATION);
      }
      if (availableSlots.length >= 3) break;
    }

    const suggestionText = availableSlots.length > 0 
      ? `That time is unavailable. The next openings are: ${availableSlots.join(", ")}.`
      : "I'm sorry, we are fully booked for the next 7 days.";

    return res.json({ results: [{ result: suggestionText }] });

  } catch (error) {
    console.error("Availability Error:", error);
    return res.json({ results: [{ result: "I'm having trouble accessing the calendar." }] });
  }
});

export default router;