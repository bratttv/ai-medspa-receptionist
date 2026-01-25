import { Router } from "express";
import { supabase } from "../services/supabase.service";
import { sendConfirmationSMS } from "../services/sms.service"; // Re-use your SMS tool

const router = Router();

router.post("/cancel", async (req, res) => {
  console.log("--- CANCELLATION REQUEST ---");
  
  // 1. Get the phone number (Vapi sends it automatically)
  const phone = req.body.message.call?.customer?.number;
  
  if (!phone) {
    return res.json({ 
      results: [{ result: "I cannot find a phone number for this call." }] 
    });
  }

  const cleanPhone = phone.replace(/[^\d+]/g, "");

  // 2. Find the UPCOMING appointment
  const { data: appt, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('client_phone', cleanPhone)
    .gt('start_time', new Date().toISOString()) // Only future dates
    .neq('status', 'cancelled') // Don't cancel twice
    .order('start_time', { ascending: true })
    .limit(1)
    .single();

  if (!appt) {
    return res.json({ 
      results: [{ result: "I couldn't find an upcoming appointment to cancel." }] 
    });
  }

  // 3. Mark as Cancelled in Database
  await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appt.id);

  console.log(`❌ Appointment ${appt.id} cancelled.`);

  // 4. Send SMS Confirmation (Optional but nice)
  // We perform a little hack here to send a "Cancellation" text using your existing service
  // Or you can make a specific cancel SMS function. For now, we just log it.
  
  return res.json({
    results: [{
      result: `Success. I have cancelled the ${appt.service_type} appointment for ${appt.client_name} on ${appt.start_time}.`
    }]
  });
});

export default router;