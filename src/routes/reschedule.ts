import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/reschedule", async (req, res) => {
  const { date, time } = req.body.message.functionCall.parameters;
  const phone = req.body.message.call?.customer?.number; // Auto-detected phone

  console.log(`🔄 Reschedule requested for ${phone} to ${date} ${time}`);

  if (!phone) return res.json({ results: [{ result: "Error: No phone number found." }] });
  const cleanPhone = phone.replace(/[^\d+]/g, "");

  // 1. Find the UPCOMING appointment (not cancelled)
  const { data: existingAppt, error } = await supabase
    .from('appointments')
    .select('id, client_name, service_type')
    .eq('client_phone', cleanPhone)
    .gt('start_time', new Date().toISOString()) // Future only
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(1)
    .single();

  if (!existingAppt) {
    return res.json({ results: [{ result: "I couldn't find an upcoming appointment to reschedule." }] });
  }

  // 2. Check if NEW time is available
  const newStartTime = new Date(`${date} ${time}`).toISOString();
  
  // (Optional: You could check for conflicts here, but for now we force the move)

  // 3. Update the Appointment
  await supabase
    .from('appointments')
    .update({ start_time: newStartTime, status: 'confirmed' })
    .eq('id', existingAppt.id);

  console.log(`✅ Moved appt ${existingAppt.id} to ${newStartTime}`);

  return res.json({
    results: [{
      result: `Success. I have moved your ${existingAppt.service_type} appointment to ${date} at ${time}.`
    }]
  });
});

export default router;