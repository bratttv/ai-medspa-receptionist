// src/routes/book.ts
import { Router } from "express";
import { createEvent, getBusyRanges } from "../services/calendar.service";
import { supabase } from "../services/supabase.service"; 
import { addMinutes } from "date-fns";

const router = Router();
const SLOT_MINUTES = Number(process.env.SLOT_MINUTES || 60);

router.post("/book", async (req, res) => {
  console.log("BOOKING ENDPOINT HIT");

  const toolCall = req.body.message.toolCallList?.[0];
  const toolCallId = toolCall?.id;

  if (!toolCallId) {
     return res.status(200).send(""); 
  }

  try {
    const args = toolCall.function.arguments;
    const clientName = args.name || "Valued Client";
    const serviceType = args.service || "Consultation";
    const clientEmail = args.email || "";
    const clientPhone = args.phone || "";
    const startTimeStr = args.dateTime;

    if (!startTimeStr) throw new Error("No date time provided");

    const start = new Date(startTimeStr);
    const end = addMinutes(start, SLOT_MINUTES);

    // 1. Safety Check (Google Calendar)
    const busy = await getBusyRanges(start.toISOString(), end.toISOString());
    if (busy.length > 0) {
      return res.status(200).json({
        results: [{
          toolCallId: toolCallId,
          result: "I apologize, but that time slot was just taken. Please ask for a different time."
        }]
      });
    }

    // 2. Create Google Calendar Event
    const summary = `${serviceType} for ${clientName}`;
    const description = `Phone: ${clientPhone}\nEmail: ${clientEmail}`;
    
    const googleEvent = await createEvent(
      start.toISOString(),
      end.toISOString(),
      summary,
      description,
      clientEmail
    );

    // 3. CRM Logging (Supabase)
    const { error: dbError } = await supabase
      .from('appointments')
      .insert([
        { 
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          service_type: serviceType,
          start_time: start.toISOString(),
          google_event_id: googleEvent.id,
          status: 'confirmed'
        }
      ]);

    if (dbError) {
      console.error("Supabase logging error:", dbError);
    }

    // 4. Success Response
    return res.status(200).json({
      results: [{
        toolCallId: toolCallId,
        result: "success"
      }]
    });

  } catch (err) {
    console.error("Booking error:", err);
    return res.status(200).json({
      results: [{
        toolCallId: toolCallId,
        result: "There was a technical error booking the appointment."
      }]
    });
  }
});

export default router;