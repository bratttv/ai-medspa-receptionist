import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import { google } from "googleapis"; 
import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- CONFIGURATION ---
const TIMEZONE = "America/Toronto";

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

// ✅ Helper: Convert 12-hour time to 24-hour format
function convertTo24Hour(timeStr: string): string {
    if (!timeStr) return "";
    
    // Already in 24-hour format (e.g., "14:00" or "09:30")
    if (/^\d{1,2}:\d{2}$/.test(timeStr) && !timeStr.toLowerCase().includes('am') && !timeStr.toLowerCase().includes('pm')) {
        const [hours, mins] = timeStr.split(':');
        return `${hours.padStart(2, '0')}:${mins}`;
    }
    
    // 12-hour format (e.g., "2:00 PM", "10:30 AM")
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
    if (!match) return timeStr; // Return as-is if can't parse
    
    let [, hours, mins, period] = match;
    let h = parseInt(hours, 10);
    
    if (period) {
        const isPM = period.toUpperCase() === 'PM';
        if (isPM && h !== 12) h += 12;
        if (!isPM && h === 12) h = 0;
    }
    
    return `${h.toString().padStart(2, '0')}:${mins}`;
}

router.post("/book_appointment", async (req, res) => {
  try {
    console.log("--- BOOKING REQUEST ---");

    // 1. SAFE PARAMETER EXTRACTION
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    // ✅ Accept BOTH formats: (dateTime) OR (date + time)
    let { name, email, phone, service, dateTime, date, time } = params as any;

    // 2. VALIDATION
    if (!name) throw new Error("I need the client's name to book.");
    if (!phone) throw new Error("I need the client's phone number to book.");

    // 3. DATE/TIME HANDLING - Support both formats
    let appointmentDate: Date;

    if (dateTime) {
        // Format 1: Combined dateTime (e.g., "2025-02-01T10:00:00")
        appointmentDate = new Date(dateTime);
    } else if (date && time) {
        // Format 2: Separate date + time (e.g., date="2025-02-01", time="10:00 AM")
        const time24 = convertTo24Hour(time);
        const isoString = `${date}T${time24}:00`;
        appointmentDate = fromZonedTime(isoString, TIMEZONE);
        console.log(`📅 Parsed: ${date} + ${time} → ${isoString} → ${appointmentDate.toISOString()}`);
    } else {
        throw new Error("I need a date and time for the appointment. Please provide date (YYYY-MM-DD) and time.");
    }

    // Check if date is valid
    if (isNaN(appointmentDate.getTime())) {
        throw new Error("Invalid date/time format. Please use date as YYYY-MM-DD and time as HH:MM or H:MM AM/PM.");
    }

    // Calculate End Time (1 Hour Duration)
    const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000);

    // 4. FORMATTING for SMS
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

    // Calculate reminder + review times
const reminderAt = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);
const reviewAt   = new Date(appointmentDate.getTime() + 24 * 60 * 60 * 1000);

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
    review_sent: false,
    reminder_at: reminderAt.toISOString(),
    review_at: reviewAt.toISOString()
}]);


    if (error) throw new Error(`Database Error: ${error.message}`);

    // 7. TWO-STEP CLIENT SMS FLOW
    // Step A: "Reserved" + deposit link (immediate)
    // Step B: "Confirmed" with details (10 seconds later)
    try {
        // --- STEP A: RESERVATION + DEPOSIT LINK ---
        await client.messages.create({
            body: `Lumen Aesthetics: Your reservation has been reserved.\n\nDate: ${readableDate}\nService: ${service || 'Treatment'}\n\nTo finalize this exclusive booking, a fully refundable security deposit is required. Please complete this securely below.\n\nLink: https://lumen-pay.com/secure-deposit/8392\n\nPlease ensure you have read our policy before finalizing your booking.\nParking is complimentary in the Green Garage (Level P2).\nValid government-issued ID is required upon entry.\n\nWe look forward to welcoming you.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log("📱 Step A: Reserved + deposit link sent");

        // --- STEP B: CONFIRMATION (10 seconds later) ---
        setTimeout(async () => {
            try {
                await client.messages.create({
                    body: `Lumen Aesthetics: Appointment Confirmed ✓\n\nDate: ${readableDate}\nService: ${service || 'Treatment'}\n\nParking: Free in Green Garage (Level P2).\nPlease bring valid government-issued ID.\n\nWe look forward to seeing you!`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: phone
                });
                console.log("📱 Step B: Confirmed SMS sent (10s delay)");
            } catch (e) {
                console.error("Step B SMS Failed:", e);
            }
        }, 10000); // 10 second delay

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
    return res.json({
        results: [{
            toolCallId: req.body.message?.toolCalls?.[0]?.id || "unknown",
            result: `Error: ${error.message}. Please ask the user for the missing information.`
        }]
    });
  }
});

export default router;