import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Matched to your working Curl route
router.post("/reschedule", async (req, res) => {
  try {
    console.log("--- RESCHEDULE REQUEST RECEIVED ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    // 1. Parse Params
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }
    
    const { phone, newDate, newTime } = params as any;

    if (!phone) {
        return res.json({ 
            results: [{ 
                toolCallId: toolCallId,
                result: "I need your phone number to find your appointment." 
            }] 
        });
    }

    // 2. Prepare New Times
    const isoString = `${newDate}T${newTime}:00-05:00`;
    const newStart = new Date(isoString);
    const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);

    // 3. Find the Appointment (FUZZY SEARCH FIX) 🔍
    // We strip non-digits to get the core number, then search for it.
    const cleanPhone = phone.replace(/\D/g, ''); // Removes +, -, spaces
    const searchPattern = `%${cleanPhone}%`;     // Matches "...1437..." or "...437..."

    const now = new Date();
    const { data: existingAppts, error: findError } = await supabase
        .from('appointments')
        .select('*')
        .ilike('client_phone', searchPattern) // 👈 CHANGED from .eq() to .ilike()
        .neq('status', 'cancelled')
        .gte('start_time', now.toISOString())
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
    console.log(`✅ Found Appointment ID: ${appointmentId}`);

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
            to: existingAppts[0].client_phone // Use the DB phone number to be safe
        });
        console.log("✅ SMS Sent");
    } catch (smsError) {
        console.error("⚠️ SMS Failed:", smsError);
    }

    // 6. Return Success
    return res.json({
        results: [{
            toolCallId: toolCallId,
            result: `I have successfully moved your appointment to ${newDate} at ${newTime}.`
        }]
    });

  } catch (error: any) {
    console.error("Reschedule Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: `Error: ${error.message}`
        }]
    });
  }
});

export default router;