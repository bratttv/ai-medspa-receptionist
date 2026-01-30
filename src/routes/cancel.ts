import { Router } from "express";
import { supabase } from "../services/supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

router.post("/cancel", async (req, res) => {
  console.log("--- CANCELLATION REQUEST ---");
  
  const toolCallId = req.body.message.toolCalls?.[0]?.id;

  // 1. Get phone from tool parameters FIRST, then fall back to call metadata
  let params = {};
  const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
  if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
  
  let { phone } = params as any;
  
  // Fallback to call metadata if no phone provided
  if (!phone) {
    phone = req.body.message.call?.customer?.number;
  }
  
  if (!phone) {
    return res.json({ 
      results: [{ 
        toolCallId: toolCallId,
        result: "I need a phone number to find the appointment to cancel." 
      }] 
    });
  }

  // 2. Clean and normalize phone for fuzzy matching
  const cleanPhone = phone.replace(/\D/g, '').replace(/^1/, '');
  const searchPattern = `%${cleanPhone}%`;

  // 3. Find the UPCOMING appointment using fuzzy search
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .ilike('client_phone', searchPattern)
    .gt('start_time', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(1);

  if (error || !appointments || appointments.length === 0) {
    return res.json({ 
      results: [{ 
        toolCallId: toolCallId,
        result: "I couldn't find an upcoming appointment for that phone number." 
      }] 
    });
  }

  const appt = appointments[0];

  // 4. Mark as Cancelled in Database
  const { error: updateError } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appt.id);

  if (updateError) {
    console.error("Cancel update error:", updateError);
    return res.json({
      results: [{
        toolCallId: toolCallId,
        result: "There was an error cancelling the appointment. Please try again."
      }]
    });
  }

  console.log(`❌ Appointment ${appt.id} cancelled for ${appt.client_name}.`);

  // 5. Send SMS Confirmation
  try {
    await client.messages.create({
      body: `Lumen Aesthetics: Your appointment has been cancelled. We'd love to see you again — call us anytime to rebook.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: appt.client_phone
    });
    console.log("📱 Cancellation SMS sent");
  } catch (smsError) {
    console.error("SMS failed:", smsError);
  }

  // 6. Format date for response
  const apptDate = new Date(appt.start_time).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Toronto'
  });

  return res.json({
    results: [{
      toolCallId: toolCallId,
      result: `Done. I've cancelled ${appt.client_name}'s ${appt.service || 'appointment'} on ${apptDate}.`
    }]
  });
});

export default router;