import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.post("/lookup-client", async (req, res) => {
  try {
    const phone = req.body.message?.call?.customer?.number;
    if (!phone) return res.json({ results: [{ result: "unknown" }] });

    // Normalize like lookup_client: digits only, strip leading 1 (so DB "5551234567" matches caller "+15551234567")
    const searchPhone = phone.replace(/\D/g, "").replace(/^1/, "");

    const { data: recentAppointments, error } = await supabase
      .from("appointments")
      .select("client_name, service_type, client_phone")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("Lookup-client DB error:", error.message);
      return res.json({ results: [{ result: "New client. Status: Unknown. Insurance: MISSING (Must ask)." }] });
    }

    const match = recentAppointments?.find((row) => {
      if (!row.client_phone) return false;
      const dbPhone = row.client_phone.replace(/\D/g, "").replace(/^1/, "");
      return dbPhone === searchPhone || dbPhone.includes(searchPhone) || searchPhone.includes(dbPhone);
    });

    if (match) {
      return res.json({
        results: [{
          result: `Returning client: ${match.client_name}. Status: VIP. Insurance: ON FILE (Do not ask).`
        }]
      });
    }

    return res.json({
      results: [{
        result: `New client. Status: Unknown. Insurance: MISSING (Must ask).`
      }]
    });
  } catch (err: any) {
    console.error("Lookup-client error:", err?.message);
    return res.json({
      results: [{ result: "New client. Status: Unknown. Insurance: MISSING (Must ask)." }]
    });
  }
});

export default router;