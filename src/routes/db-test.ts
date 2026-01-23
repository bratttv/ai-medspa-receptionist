import { Router } from "express";
import { supabase } from "../services/supabase.service";

const router = Router();

router.get("/db-test", async (_req, res) => {
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, data });
});

export default router;
