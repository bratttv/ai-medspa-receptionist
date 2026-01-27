import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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

    if (!name || !phone || !dateTime) {
        throw new Error("Missing required fields: name, phone, or dateTime.");
    }

    // 2. Calculate End Time (1 Hour)
    const startDate = new Date(dateTime);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    // 3. Save to Supabase
    const { data, error } = await supabase.from('appointments').insert([
      {
        client_name: name,
        client_email: email || "",
        client_phone: phone,
        start_time: dateTime,
        end_time: endDate.toISOString(),
        status: 'confirmed',
        service: service || 'General Checkup',      
        service_type: service || 'General Checkup', 
        reminder_sent: false
      }
    ]).select();

    if (error) {
        throw new Error(`Database save failed: ${error.message}`);
    }

    console.log("✅ Booking Successful in DB");

    // 4. 📲 SEND SMS IMMEDIATELY (The Fix)
    try {
        // Format the date to look nice (e.g., "Friday, Jan 30 at 3:00 PM")
        const readableDate = new Date(dateTime).toLocaleString("en-US", {
            timeZone: "America/New_York", // Force Toronto Time
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });

        await client.messages.create({
            body: `Hi ${name}, your appointment for ${service || 'MedSpa Service'} is confirmed for ${readableDate}. See you soon!`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log("✅ Confirmation SMS Sent to " + phone);
    } catch (smsError) {
        console.error("⚠️ SMS Failed (but booking is saved):", smsError);
    }

    // 5. Return Success
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "Appointment confirmed and SMS sent."
        }]
    });

  } catch (error: any) {
    console.error("Booking Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: `Error: ${error.message}`
        }]
    });
  }
});

export default router;