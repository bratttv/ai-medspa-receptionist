import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { addMinutes, addDays, setHours, setMinutes, isBefore, parseISO } from "date-fns";

const router = Router();

// ⚙️ CONFIGURATION
const BUSINESS_START_HOUR = 9; // 9 AM
const BUSINESS_END_HOUR = 17;  // 5 PM
const SLOT_DURATION = 60;      // Minutes per appointment
const LOOKAHEAD_DAYS = 7;      // How far to look for empty spots

// Helper: Check if two time ranges overlap
function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA;
}

router.post("/check-availability", async (req, res) => {
  try {
    // 1. Get parameters from Vapi (Handling both new and old Vapi formats)
    let params = req.body.message.functionCall?.parameters;
    if (!params && req.body.message.toolCalls) {
        params = req.body.message.toolCalls[0].function.arguments;
    }
    
    // Default to "checking now" if no params provided
    const { date, time } = params || {};

    console.log(`Checking availability... Date: ${date}, Time: ${time}`);

    // 2. Fetch ALL busy slots from Supabase for the next 7 days
    const now = new Date();
    const endSearch = addDays(now, LOOKAHEAD_DAYS);

    const { data: busyData } = await supabase
      .from('appointments')
      .select('start_time')
      .neq('status', 'cancelled')
      .gte('start_time', now.toISOString())
      .lte('start_time', endSearch.toISOString());

    // Convert DB strings to Date objects
    const busyRanges = (busyData || []).map(appt => ({
      start: new Date(appt.start_time),
      end: addMinutes(new Date(appt.start_time), SLOT_DURATION)
    }));

    // 3. IF USER REQUESTED A SPECIFIC TIME, CHECK IT FIRST
    if (date && time) {
      const requestedStart = new Date(`${date} ${time}`);
      // Create a small buffer window (+/- 1 min) to match loose timestamps
      const checkStart = new Date(requestedStart.getTime() + 1000); 
      const checkEnd = addMinutes(requestedStart, SLOT_DURATION - 1);

      const isTaken = busyRanges.some(busy => overlaps(checkStart, checkEnd, busy.start, busy.end));

      if (!isTaken) {
        // ✅ IT IS FREE!
        return res.json({
          results: [{ result: "That time is available." }]
        });
      }
      
      // ❌ IT IS BUSY (Fall through to the logic below to find suggestions)
      console.log("Requested time is busy. Finding alternatives...");
    }

    // 4. FIND THE NEXT AVAILABLE SLOTS (The "Slot Finder" Logic)
    const availableSlots: string[] = [];

    for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
      const currentDay = addDays(now, i);
      
      // Set start/end times for this specific day (e.g., 9 AM to 5 PM)
      let slotTime = setHours(setMinutes(currentDay, 0), BUSINESS_START_HOUR);
      const endOfDay = setHours(setMinutes(currentDay, 0), BUSINESS_END_HOUR);

      // Loop through every hour of the day
      while (isBefore(slotTime, endOfDay)) {
        const slotEnd = addMinutes(slotTime, SLOT_DURATION);

        // Skip past times if looking at today
        if (slotTime > now) {
          const isConflict = busyRanges.some(busy => 
            overlaps(slotTime, slotEnd, busy.start, busy.end)
          );

          if (!isConflict) {
            // Found a free one!
            availableSlots.push(
              slotTime.toLocaleString("en-US", { 
                weekday: "long", hour: "numeric", minute: "2-digit" 
              })
            );
          }
        }

        // Stop if we found 3 suggestions
        if (availableSlots.length >= 3) break;
        
        // Move to next slot
        slotTime = addMinutes(slotTime, SLOT_DURATION);
      }
      if (availableSlots.length >= 3) break;
    }

    // 5. RETURN THE SMART RESPONSE
    const suggestionText = availableSlots.length > 0 
      ? `That time is unavailable. The next openings are: ${availableSlots.join(", ")}.`
      : "I'm sorry, we are fully booked for the next 7 days.";

    return res.json({
      results: [{
        result: suggestionText
      }]
    });

  } catch (error) {
    console.error("Availability Error:", error);
    return res.json({ results: [{ result: "I'm having trouble accessing the calendar." }] });
  }
});

export default router;