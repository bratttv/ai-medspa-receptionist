import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/lookup-client", async (req, res) => {
  // 1. Get the phone number from the Vapi call metadata
  const phone = req.body.message?.call?.customer?.number;

  console.log("🔍 Looking up client phone:", phone);

  if (!phone) {
    return res.json({ results: [{ result: "No phone number found." }] });
  }

  // 2. Format it to match database (remove +1 if your DB stores it differently, 
  // but usually we match fuzzy)
  const cleanPhone = phone.replace(/[^\d+]/g, "");

  // 3. Check Supabase for the MOST RECENT appointment
  const { data, error } = await supabase
    .from('appointments')
    .select('client_name, service_type, start_time')
    .eq('client_phone', cleanPhone)
    .order('start_time', { ascending: false }) // Get the latest one
    .limit(1);

  if (data && data.length > 0) {
    // FOUND RETURNING CLIENT
    const client = data[0];
    const resultText = `Returning client found: ${client.client_name}. Last service was ${client.service_type}. Greet them by name.`;
    
    console.log("✅ Found:", resultText);
    
    return res.json({
      results: [{
        result: resultText
      }]
    });
  } else {
    // NEW CLIENT
    console.log("👤 New Client (not found in DB)");
    return res.json({
      results: [{
        result: "This appears to be a new client. Ask for their name."
      }]
    });
  }
});

export default router;