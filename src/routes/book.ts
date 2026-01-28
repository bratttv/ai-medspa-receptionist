import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import { google } from "googleapis"; 
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Google Calendar Setup
const calendar = google.calendar({ version: "v3" });

// 1. LOAD THE KEYS (Using GC_ names from your screenshot)
// We define them here so we can use them later
const rawKey = process.env.GC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
const clientEmail = process.env.GC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
const calendarId = process.env.GC_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || 'primary'; // 👈 THIS WAS MISSING!

// 2. FIX NEWLINES
const privateKey = rawKey
  ? rawKey.replace(/\\n/g, '\n')
  : undefined;

// 3. AUTHENTICATION (The "Nuclear Fix" for TypeScript)
const JWT = google.auth.JWT as any;
const auth = new JWT(
    clientEmail,
    undefined,
    privateKey,
    ['https://www.googleapis.com/auth/calendar']
);

router.post("/book_appointment", async (req, res) => {
  try {
    console.log("--- BOOKING REQUEST ---");
    
    // Parse Params
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    let { name, email, phone, service, dateTime, date, time } = params as any;

    if (!dateTime && date && time) dateTime = `${date}T${time}:00`; 
    if (!name || !phone || !dateTime) throw new Error("Missing required fields.");

    // Times (Force Toronto)
    const cleanDateStr = dateTime.includes("T") ? dateTime : `${dateTime}T09:00:00`; 
    const startDate = new Date(cleanDateStr); 
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 Hour

    console.log(`📝 Booking: ${name} @ ${startDate.toLocaleString()}`);

    // GOOGLE CALENDAR SYNC 📅
    try {
        await calendar.events.insert({
            auth: auth,
            calendarId: calendarId, // 👈 Now this works because we defined it at the top
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
    }

    // Save to Supabase
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

    // SMS Confirmation
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

    // Team SMS
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