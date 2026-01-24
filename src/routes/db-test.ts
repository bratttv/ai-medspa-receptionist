// src/routes/db-test.ts
import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.get("/db-test", async (req, res) => {
  try {
    // Try to select 1 row just to check connection
    const { data, error } = await supabase.from('appointments').select('*').limit(1);

    if (error) throw error;

    res.json({
      ok: true,
      message: "Supabase connection successful!",
      data
    });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      message: "Supabase connection failed",
      error: error.message
    });
  }
});

export default router;