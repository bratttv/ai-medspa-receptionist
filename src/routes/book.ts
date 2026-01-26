import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { sendConfirmationSMS } from "../services/sms.service";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TEAM_PHONE = process.env.TEAM_PHONE || "+14374405408"; // Your cell number

router.post("/book", async (req, res) => {
  console.log("--- BOOKING REQUEST RECEIVED ---");

  try {
    // 1. ROBUST ARGUMENT EXTRACTION
    let args = req.body.message.functionCall?.parameters;
    if (!args && req.body.message.toolCalls) {
      // Handle the "double parse" issue safely
      const rawArgs = req.body.message.toolCalls[0].function.arguments;
      args = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    if (!args) {
      console.log("No arguments found.");
      return res.status(200).send("");
    }

    console.log("Arguments:", args);

    const clientName = args.name || args.client_name || "Valued Client";
    const serviceType = args.service || args.service_type || "Consultation";
    const clientPhone = args.phone || args.client_phone || "";
    const clientEmail = args.email || args.client_email || "";
    
    // Handle Date/Time logic
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

    // 3. SAVE TO SUPABASE
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
        }
      ]);

    if (dbError) {
      console.error("Supabase Error:", dbError);
      throw new Error("Database save failed");
    }

    // 4. SEND SMS TO CLIENT (The Confirmation)
    if (clientPhone) {
      console.log("Sending Confirmation SMS to Client...");
      await sendConfirmationSMS(clientPhone, clientName, start.toISOString(), serviceType);
    }

    // 5. 🔔 SEND SMS TO TEAM (You!)
    try {
        const teamMsg = `✅ NEW BOOKING: ${clientName} booked ${serviceType} for ${start.toLocaleString()} (Phone: ${clientPhone})`;
        
        await client.messages.create({
            body: teamMsg,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: TEAM_PHONE,
        });
        console.log("Team Notification Sent.");
    } catch (teamSmsError) {
        console.error("Failed to alert team (Booking still successful):", teamSmsError);
    }

    // 6. SUCCESS RESPONSE TO VAPI
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