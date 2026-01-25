import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { sendConfirmationSMS } from "../services/sms.service";

const router = Router();

router.post("/book", async (req, res) => {
  console.log("--- BOOKING REQUEST RECEIVED ---");

  try {
    // 1. ROBUST ARGUMENT EXTRACTION
    // Handles both "old" Vapi (functionCall) and "new" Vapi (toolCalls)
    let args = req.body.message.functionCall?.parameters;
    if (!args && req.body.message.toolCalls) {
      args = JSON.parse(req.body.message.toolCalls[0].function.arguments);
    }
    
    // Safety check: if Vapi sent nothing
    if (!args) {
      console.log("No arguments found.");
      return res.status(200).send("");
    }

    console.log("Arguments:", args);

    const clientName = args.name || args.client_name || "Valued Client";
    const serviceType = args.service || args.service_type || "Consultation";
    const clientPhone = args.phone || args.client_phone || "";
    const clientEmail = args.email || args.client_email || "";
    
    // Handle Date/Time (Accepts "dateTime" combined OR "date" + "time" separate)
    let startTimeStr = args.dateTime; 
    if (!startTimeStr && args.date && args.time) {
      startTimeStr = `${args.date} ${args.time}`;
    }

    // 2. CREATE TIMESTAMP
    const start = new Date(startTimeStr);
    if (isNaN(start.getTime())) {
      console.error("Invalid Date:", startTimeStr);
      return res.json({ results: [{ result: "I didn't catch the date correctly. Could you repeat it?" }] });
    }

    // 3. SAVE TO SUPABASE (No Google Calendar!)
    const { error: dbError } = await supabase
      .from('appointments')
      .insert([
        { 
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          service_type: serviceType,
          start_time: start.toISOString(),
          status: 'confirmed'
          // Removed google_event_id
        }
      ]);

    if (dbError) {
      console.error("Supabase Error:", dbError);
      throw new Error("Database save failed");
    }

    // 4. SEND SMS
    if (clientPhone) {
      console.log("Sending SMS...");
      await sendConfirmationSMS(clientPhone, clientName, start.toISOString(), serviceType);
    }

    // 5. SUCCESS RESPONSE
    return res.json({
      results: [{
        result: `Success. I have booked ${serviceType} for ${clientName} on ${start.toLocaleString()}.`
      }]
    });

  } catch (err) {
    console.error("Booking Error:", err);
    return res.json({
      results: [{
        result: "I had a technical issue finalizing that booking. Please try again."
      }]
    });
  }
});

export default router;