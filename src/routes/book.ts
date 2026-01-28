import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import { google } from "googleapis"; // 👈 This line fails if you don't install!
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Google Calendar Setup (With Crash Prevention)
const calendar = google.calendar({ version: "v3" });

// 🛡️ SAFELY LOAD THE KEY
const privateKey = process.env.GOOGLE_PRIVATE_KEY
  ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')  // Fixes Render/Heroku newlines
  : undefined;

const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    undefined,
    privateKey,
    ['https://www.googleapis.com/auth/calendar']
);

router.post("/book_appointment", async (req, res) => {
  try {
    console.log("--- BOOKING REQUEST ---");
    
    // 1. Parse Params
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    let { name, email, phone, service, dateTime, date, time } = params as any;

    if (!dateTime && date && time) dateTime = `${date}T${time}:00`; 
    if (!name || !phone || !dateTime) throw new Error("Missing required fields.");

    // 2. Times (Force Toronto)
    const cleanDateStr = dateTime.includes("T") ? dateTime : `${dateTime}T09:00:00`; 
    const startDate = new Date(cleanDateStr); 
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 Hour

    console.log(`📝 Booking: ${name} @ ${startDate.toLocaleString()}`);

    // 3. GOOGLE CALENDAR SYNC 📅
    try {
        await calendar.events.insert({
            auth: auth,
            calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary', // Use your real email in .env!
            requestBody: {
                summary: `💆‍♀️ ${name} - ${service || 'MedSpa Service'}`,
                description: `Phone: ${phone}\nEmail: ${email}\nBooked via AI Lumina`,
                start: { dateTime: startDate.toISOString(), timeZone: "America/New_York" },
                end: { dateTime: endDate.toISOString(), timeZone: "America/New_York" },
            }
        });
        console.log("✅ Added to Google Calendar");
    } catch (gError: any) {
        console.error("⚠️ Google Calendar Failed:", gError.message);
        // We do NOT crash here. We let the booking continue to DB/SMS.
    }

    // 4. Save to Supabase
    const { error } = await supabase.from('appointments').insert([{
        client_name: name,
        client_email: email || "",
        client_phone: phone,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'confirmed',
        service: service || 'MedSpa Service',      
        service_type: service || 'General', 
        reminder_sent: false
    }]);

    if (error) throw new Error(`Database save failed: ${error.message}`);

    // 5. SMS Confirmation (Client)
    const readableDate = startDate.toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });

    try {
        await client.messages.create({
            body: `Hi ${name}, confirmed: ${service || 'Appt'} on ${readableDate}.\n\n🅿️ PARKING: Free in Green Garage (Level P2).\n🆔 Bring ID.\n\nSee you soon! - Lumen Aesthetics`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log("✅ Client SMS Sent");
    } catch (e) { console.error("SMS Error:", e); }

    // 6. Team SMS
    if (process.env.TEAM_PHONE) {
        try {
            await client.messages.create({
                body: `🔔 NEW BOOKING\nClient: ${name}\nTime: ${readableDate}\nCal: Synced ✅`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.TEAM_PHONE
            });
        } catch (e) {}
    }

    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "Appointment confirmed, calendar synced, and SMS sent."
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