import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ ROUTE: Matches your curl command (/reschedule)
router.post("/reschedule", async (req, res) => {
  try {
    console.log("--- RESCHEDULE REQUEST RECEIVED ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    // 1. 🛡️ PARSING FIX: Handle Vapi's complex JSON format
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) {
        // If Vapi sends a stringified JSON, we parse it. If it's already an object, we use it.
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    console.log("Parsed Params:", params); // This will show us the phone number in logs
    const { phone, newDate, newTime } = params as any;

    if (!phone) {
        console.error("❌ Error: Phone number is missing from request.");
        return res.json({ 
            results: [{ 
                toolCallId: toolCallId,
                result: "I need your phone number to find your appointment." 
            }] 
        });
    }

    // 2. Prepare New Times (Toronto Time)
    const isoString = `${newDate}T${newTime}:00-05:00`;
    const newStart = new Date(isoString);
    const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000); // Add 1 Hour

    // 3. Find the Appointment
    const now = new Date();
    const { data: existingAppts, error: findError } = await supabase
        .from('appointments')
        .select('*')
        .eq('client_phone', phone)
        .neq('status', 'cancelled')
        .gte('start_time', now.toISOString()) // Only future appointments
        .order('start_time', { ascending: true })
        .limit(1);

    if (findError || !existingAppts || existingAppts.length === 0) {
        console.log("❌ No appointment found for phone:", phone);
        return res.json({ 
            results: [{ 
                toolCallId: toolCallId, 
                result: "I couldn't find an upcoming appointment for that phone number." 
            }] 
        });
    }

    const appointmentId = existingAppts[0].id;

    // 4. Update Database
    const { error: updateError } = await supabase
        .from('appointments')
        .update({
            start_time: newStart.toISOString(),
            end_time: newEnd.toISOString(),
            reminder_sent: false
        })
        .eq('id', appointmentId);

    if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
    }

    console.log("✅ Reschedule Successful in DB");

    // 5. Send SMS Confirmation
    try {
        const readableDate = newStart.toLocaleString("en-US", {
            timeZone: "America/New_York",
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });

        await client.messages.create({
            body: `Reschedule Confirmed: Your appointment has been moved to ${readableDate}. See you then!`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log("✅ SMS Sent to:", phone);
    } catch (smsError) {
        console.error("⚠️ SMS Failed:", smsError);
    }

    // 6. Return Success
    return res.json({
        results: [{
            toolCallId: toolCallId,
            result: `I have successfully moved your appointment to ${newDate} at ${newTime}. You will receive a text confirmation shortly.`
        }]
    });

  } catch (error: any) {
    console.error("Reschedule Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: `I had trouble rescheduling the appointment. ${error.message}`
        }]
    });
  }
});

export default router;