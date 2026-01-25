// src/routes/inbound-sms.ts
import { Router } from "express";
import { supabase } from "../services/supabase.service";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse";

const router = Router();

router.post("/sms-webhook", async (req, res) => {
  const { From, Body } = req.body;
  
  // Clean the phone number to match Database format
  const cleanPhone = From.replace(/[^\d+]/g, ""); 
  const message = Body ? Body.trim().toUpperCase() : "";

  console.log(`📩 SMS Received from ${cleanPhone}: ${message}`);

  const twiml = new MessagingResponse();

  // CHECK FOR CONFIRMATION KEYWORDS
  if (['C', 'YES', 'CONFIRM', 'OK'].includes(message)) {
    
    // 1. Find the next "Confirmed" appointment for this person
    const { data: appt, error } = await supabase
      .from('appointments')
      .select('id, client_name')
      .eq('client_phone', cleanPhone)
      // We check for 'confirmed' status because we want to move it to 'client_verified'
      .eq('status', 'confirmed') 
      .gt('start_time', new Date().toISOString()) // Only future appointments
      .order('start_time', { ascending: true })
      .limit(1)
      .single();

    if (appt) {
      // 2. Update status in Database
      await supabase
        .from('appointments')
        .update({ status: 'client_verified' })
        .eq('id', appt.id);

      // 3. Send Success Reply
      twiml.message(`Thanks ${appt.client_name}, your appointment is now fully verified! We look forward to seeing you.`);
      console.log(`✅ Appointment ${appt.id} status updated to client_verified.`);
    } else {
      twiml.message("We couldn't find a pending appointment to confirm. It might already be verified, or please call us.");
    }

  } else if (message.includes("CANCEL")) {
    twiml.message("To cancel, please give us a call at (416) 555-0199 so we can reschedule you.");
  } else {
    // Fallback for random messages
    twiml.message("Thanks for your message. A team member will review it shortly. Reply C to confirm your appointment.");
  }

  // Send the TwiML response back to Twilio
  res.type('text/xml').send(twiml.toString());
});

export default router;