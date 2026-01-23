import { Router } from "express";

const router = Router();

/**
 * Vapi inbound webhook (test)
 */
router.post("/voice/inbound", async (req, res) => {
  console.log("VAPI INBOUND CALL");
  console.log(req.body);

  return res.json({
    message: "Voice webhook received successfully"
  });
});

export default router;
