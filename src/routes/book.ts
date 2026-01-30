import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import { google } from "googleapis"; 
import { format } from "date-fns"; // Standard formatting
import { toZonedTime } from "date-fns-tz"; // Timezone handling
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- CONFIGURATION ---
const TIMEZONE = "America/Toronto"; // 🇨🇦 Locked to Toronto

// --- GOOGLE CALENDAR SETUP ---
const rawKey = process.env.GC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
const clientEmail = process.env.GC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
const calendarId = process.env.GC_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || 'primary';

let privateKey = rawKey;
if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
    privateKey = privateKey.replace(/\\n/g, '\n');
}

const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: "v3", auth });

router.post("/book_appointment", async (req, res) => {
  try {
    console.log("--- BOOKING REQUEST ---");

    // 1. SAFE PARAMETER EXTRACTION
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    // We only care about these 4 things.
    let { name, email, phone, service, dateTime } = params as any;

    // 2. VALIDATION (The "Name at Start" check)
    // If the AI calls this tool without a name, we reject it here.
    if (!name) throw new Error("I need the client's name to book.");
    if (!phone) throw new Error("I need the client's phone number to book.");
    if (!dateTime) throw new Error("I need a valid ISO date and time (YYYY-MM-DDTHH:mm:ss).");

    // 3. DATE FIX (The "October" Fix)
    // We treat the input as a strict ISO string. No guessing.
    const appointmentDate = new Date(dateTime);

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
        throw new Error("Invalid Date Format. Please provide ISO-8601 (e.g., 2026-02-30T10:00:00).");
    }

    // Calculate End Time (1 Hour Duration)
    const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000);

    // 4. FORMATTING (The "Full Date" Fix)
    // We format it specifically for Toronto Timezone so it looks perfect in SMS.
    // Result: "Tuesday, February 10th, 2026 at 2:00 PM"
    const readableDate = format(toZonedTime(appointmentDate, TIMEZONE), "EEEE, MMMM do, yyyy 'at' h:mm a");

    console.log(`✅ Booking Confirmed: ${name} @ ${readableDate}`);

    // 5. GOOGLE CALENDAR SYNC
    try {
        await calendar.events.insert({
            calendarId: calendarId,
            requestBody: {
                summary: `${name} - ${service || 'Lumen Treatment'}`,
                description: `Phone: ${phone}\nBooked via AI`,
                start: { dateTime: appointmentDate.toISOString(), timeZone: TIMEZONE },
                end: { dateTime: endDate.toISOString(), timeZone: TIMEZONE },
            }
        });
        console.log("📅 Added to Google Calendar");
    } catch (gError: any) {
        console.error("Google Calendar Warning:", gError.message);
    }

    // 6. SAVE TO SUPABASE
    const { error } = await supabase.from('appointments').insert([{
        client_name: name,
        client_email: email || "",
        client_phone: phone,
        start_time: appointmentDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'confirmed',
        service: service || 'MedSpa Service',      
        reminder_sent: false,
        review_sent: false // Ensure this is false so the review SMS doesn't fire immediately
    }]);

    if (error) throw new Error(`Database Error: ${error.message}`);

    // 7. CLIENT SMS (Premium & Professional)
    try {
        await client.messages.create({
            body: `Lumen Aesthetics: Appointment Confirmed.\n\nDate: ${readableDate}\nService: ${service || 'Treatment'}\n\nParking: Free in Green Garage (Level P2).\nPlease bring valid ID.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log("📱 Client SMS Sent");
    } catch (e) { console.error("SMS Failed:", e); }

    // 8. TEAM NOTIFICATION
    if (process.env.TEAM_PHONE) {
        try {
            await client.messages.create({
                body: `💰 NEW BOOKING\n${name}\n${readableDate}\n${service}`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: process.env.TEAM_PHONE
            });
        } catch (e) {}
    }

    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: `Success. Appointment booked for ${readableDate}.`
        }]
    });

  } catch (error: any) {
    console.error("Booking Logic Error:", error.message);
    // Return the error to the AI so it knows to ask again
    return res.json({
        results: [{
            toolCallId: req.body.message?.toolCalls?.[0]?.id || "unknown",
            result: `Error: ${error.message}. Please ask the user for the missing information.`
        }]
    });
  }
});

export default router;