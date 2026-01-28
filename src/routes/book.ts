import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import { google } from "googleapis"; 
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- 🔧 KEY CLEANER & LOADER ---
const rawKey = process.env.GC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
const clientEmail = process.env.GC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
const calendarId = process.env.GC_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || 'primary';

// Robust Key Cleaning (Fixes spaces, quotes, and newlines)
let privateKey = rawKey;
if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1); // Remove surrounding quotes
    }
    privateKey = privateKey.replace(/\\n/g, '\n'); // Fix literal \n
}

console.log("--- KEY DIAGNOSTICS ---");
console.log(`📧 Email: ${clientEmail ? '✅ Loaded' : '❌ MISSING'}`);
console.log(`🔑 Key: ${privateKey ? `✅ Loaded (${privateKey.length} chars)` : '❌ MISSING'}`);
console.log(`📅 Cal ID: ${calendarId}`);

// Google Auth Setup
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: clientEmail,
        private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: "v3", auth });


router.post("/book_appointment", async (req, res) => {
  try {
    console.log("--- BOOKING REQUEST ---");

    // 🛡️ CRASH PREVENTION: Check inputs before using them
    if (!req.body) {
        throw new Error("Request body is empty. Did you forget 'Content-Type: application/json'?");
    }
    if (!req.body.message) {
        throw new Error("Invalid format: 'message' field is missing from Vapi payload.");
    }

    // 1. Parse Params (Safely)
    let params = {};
    const functionCall = req.body.message.functionCall;
    const toolCalls = req.body.message.toolCalls;

    const rawArgs = functionCall?.parameters || toolCalls?.[0]?.function?.arguments;
    
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    let { name, email, phone, service, dateTime, date, time } = params as any;

    // Handle Time Formatting
    if (!dateTime && date && time) dateTime = `${date}T${time}:00`; 
    if (!name || !phone || !dateTime) {
        console.warn("⚠️ Missing fields:", params);
        throw new Error("Missing required fields (name, phone, or time).");
    }

    // Times (Force Toronto)
    const cleanDateStr = dateTime.includes("T") ? dateTime : `${dateTime}T09:00:00`; 
    const startDate = new Date(cleanDateStr); 
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 Hour

    console.log(`📝 Booking: ${name} @ ${startDate.toLocaleString()}`);

    // 2. GOOGLE CALENDAR SYNC 📅
    try {
        await calendar.events.insert({
            calendarId: calendarId,
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
        // Don't throw here, let the booking continue
    }

    // 3. Save to Supabase
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

    // 4. SMS Confirmation
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

    // 5. Team SMS
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
    console.error("Booking Error:", error.message);
    return res.json({
        results: [{
            toolCallId: req.body.message?.toolCalls?.[0]?.id || "unknown",
            result: `Error: ${error.message}`
        }]
    });
  }
});

export default router;