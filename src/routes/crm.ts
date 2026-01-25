import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/lookup-client", async (req, res) => {
  const phone = req.body.message?.call?.customer?.number;
  if (!phone) return res.json({ results: [{ result: "unknown" }] });

  const cleanPhone = phone.replace(/[^\d+]/g, "");

  // Check if they have ANY past appointment that wasn't cancelled
  const { data, error } = await supabase
    .from('appointments')
    .select('client_name, service_type')
    .eq('client_phone', cleanPhone)
    .neq('status', 'cancelled')
    .limit(1);

  if (data && data.length > 0) {
    // 🟢 RETURNING CLIENT
    // We tell the AI: "Insurance is on file."
    return res.json({
      results: [{
        result: `Returning client: ${data[0].client_name}. Status: VIP. Insurance: ON FILE (Do not ask).`
      }]
    });
  } else {
    // 🔴 NEW CLIENT
    // We tell the AI: "Needs insurance."
    return res.json({
      results: [{
        result: `New client. Status: Unknown. Insurance: MISSING (Must ask).`
      }]
    });
  }
});

export default router;