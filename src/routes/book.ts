import { Router } from "express";
import { createEvent, getBusyRanges } from "../services/calendar.service";
import { supabase } from "../services/supabase.service";
import { addMinutes } from "date-fns";
import { sendConfirmationSMS } from "../services/sms.service"; 

const router = Router();
const SLOT_MINUTES = Number(process.env.SLOT_MINUTES || 60);

router.post("/book", async (req, res) => {
  console.log("--- BOOKING REQUEST RECEIVED ---");

  const toolCall = req.body.message.toolCallList?.[0];
  const toolCallId = toolCall?.id;

  if (!toolCallId) return res.status(200).send(""); 

  try {
    const args = toolCall.function.arguments;
    console.log("Arguments received:", JSON.stringify(args));

    const clientName = args.name || "Valued Client";
    const serviceType = args.service || "Consultation";
    const clientEmail = args.email || "";
    const clientPhone = args.phone || "";
    let startTimeStr = args.dateTime;

    if (!startTimeStr) {
      throw new Error("Missing 'dateTime' argument. AI did not send a date.");
    }

    const start = new Date(startTimeStr);
    if (isNaN(start.getTime())) {
       throw new Error(`Invalid date format received: ${startTimeStr}`);
    }

    const end = addMinutes(start, SLOT_MINUTES);

    // --- 1. GOOGLE CALENDAR ---
    console.log("Attempting Google Calendar...");
    const summary = `${serviceType} for ${clientName}`;
    const description = `Phone: ${clientPhone}\nEmail: ${clientEmail}`;
    
    const googleEvent = await createEvent(
      start.toISOString(),
      end.toISOString(),
      summary,
      description,
      clientEmail
    );
    console.log("Google Calendar Success:", googleEvent.id);

    // --- 2. SUPABASE ---
    console.log("Attempting Supabase...");
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
      console.error("SUPABASE ERROR:", dbError); 
    } else {
      console.log("Supabase Success");
    }

    // 👇 3. SEND SMS (ADD THIS PART HERE) 👇
    // This happens right after saving to the database, but before telling the AI "success"
    console.log("Attempting SMS...");
    sendConfirmationSMS(clientPhone, clientName, start.toISOString(), serviceType);

    // --- 4. SUCCESS RESPONSE ---
    return res.status(200).json({
      results: [{
        toolCallId: toolCallId,
        result: "success"
      }]
    });

  } catch (err: any) {
    console.error("CRITICAL BOOKING ERROR:", err.message); 
    console.error(err);

    return res.status(200).json({
      results: [{
        toolCallId: toolCallId,
        result: "There was a technical error booking the appointment."
      }]
    });
  }
});

export default router;