import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/book_appointment", async (req, res) => {
  try {
    console.log("--- BOOKING REQUEST RECEIVED ---");
    
    // 1. Get Params
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    const { name, email, phone, service, dateTime } = params as any;

    // 2. Validate
    if (!name || !phone || !dateTime) {
        throw new Error("Missing required fields: name, phone, or dateTime.");
    }

    // 3. CALCULATE END TIME (The Fix)
    // We automatically set the appointment length to 60 minutes
    const startDate = new Date(dateTime);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Add 1 Hour

    // 4. Save to Supabase
    const { data, error } = await supabase.from('appointments').insert([
      {
        client_name: name,
        client_email: email || "",
        client_phone: phone,
        start_time: dateTime,
        end_time: endDate.toISOString(), // 👈 THIS WAS MISSING
        status: 'confirmed',
        service: service || 'General Checkup',      
        service_type: service || 'General Checkup', 
        reminder_sent: false
      }
    ]).select();

    if (error) {
        console.error("Supabase Error:", error);
        throw new Error(`Database save failed: ${error.message}`);
    }

    console.log("✅ Booking Successful:", data);

    // 5. Return Success
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "Appointment confirmed successfully."
        }]
    });

  } catch (error: any) {
    console.error("Booking Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: `There was an error saving the appointment: ${error.message}`
        }]
    });
  }
});

export default router;