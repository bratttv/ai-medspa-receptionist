import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import { google } from "googleapis"; 
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- KEY LOADER ---
const rawKey = process.env.GC_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
const clientEmail = process.env.GC_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
const calendarId = process.env.GC_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || 'primary';
const TIMEZONE = "America/Toronto";

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

    if (!req.body.message) throw new Error("Invalid format: 'message' missing.");

    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    
    let { name, email, phone, service, dateTime, date, time } = params as any;

    if (!name) {
        throw new Error("Please provide your full name to book the appointment.");
    }
    if (!phone) {
        throw new Error("Please provide a phone number to book the appointment.");
    }

    if (!dateTime && date && time) dateTime = `${date}T${time}`; 
    if (!dateTime) {
        throw new Error("Please provide the exact date in YYYY-MM-DD and a time.");
    }

    const dateTimeStr = typeof dateTime === "string" ? dateTime : "";
    const dateStr = typeof date === "string" ? date : "";
    const hasWeekday = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)/i.test(dateTimeStr) ||
        /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)/i.test(dateStr);
    const hasExplicitDate = /^\d{4}-\d{2}-\d{2}/.test(dateTimeStr) || /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

    if (hasWeekday && !hasExplicitDate) {
        throw new Error("Please confirm the exact date in YYYY-MM-DD (e.g. 2026-02-01).");
    }
    if (!hasExplicitDate) {
        throw new Error("Please provide the exact date in YYYY-MM-DD (e.g. 2026-02-01).");
    }

    // TIMEZONE LOGIC (Toronto Fixed)
    let timeString = dateTimeStr;
    if (timeString.toLowerCase().includes("pm") || timeString.toLowerCase().includes("am")) {
       timeString = timeString.replace(/ ?[ap]m/i, ""); 
    }
    if (timeString.split(":").length === 2) timeString += ":00";
    if (!timeString.includes("T")) timeString = timeString.replace(" ", "T");

    if (!/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}:\d{2}$/.test(timeString)) {
        throw new Error("Please provide the time in HH:MM (24-hour) along with YYYY-MM-DD.");
    }

    // Normalize single-digit hour to two digits for consistency
    timeString = timeString.replace(/T(\d):/, "T0$1:");

    const startDate = fromZonedTime(timeString, TIMEZONE);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    console.log(`Booking: ${name} @ ${formatInTimeZone(startDate, TIMEZONE, "EEE, MMM d, h:mm a")}`);

    // GOOGLE CALENDAR
    try {
        await calendar.events.insert({
            calendarId: calendarId,
            requestBody: {
                summary: `${name} - ${service || 'MedSpa Service'}`,
                description: `Phone: ${phone}\nEmail: ${email}\nBooked via AI Receptionist`,
                start: { dateTime: startDate.toISOString(), timeZone: TIMEZONE },
                end: { dateTime: endDate.toISOString(), timeZone: TIMEZONE },
            }
        });
        console.log("Added to Google Calendar");
    } catch (gError: any) {
        console.error("Google Calendar Warning:", gError.message);
    }

    // SUPABASE
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

    // SMS (Professional - No Emojis)
    const readableDate = formatInTimeZone(startDate, TIMEZONE, "EEE, MMM d, h:mm a");

    try {
        await client.messages.create({
            body: `Hello ${name}, your appointment for ${service || 'Service'} is confirmed for ${readableDate}. \n\nParking: Free in Green Garage (Level P2). \nPlease bring valid ID. \n\nLumen Aesthetics`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log("Client SMS Sent");
    } catch (e) { console.error("SMS Error:", e); }

    // TEAM SMS
    if (process.env.TEAM_PHONE) {
        try {
            await client.messages.create({
                body: `NEW BOOKING\nClient: ${name}\nTime: ${readableDate}\nCalendar: Synced`,
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