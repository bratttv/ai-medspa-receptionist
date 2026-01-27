import { Router } from "express";

const router = Router();

router.post("/check_availability", async (req, res) => {
  console.log("⚡ SPEED TEST: Vapi connected successfully!");
  
  // Return a fake success immediately
  return res.json({
    results: [{
      result: "I have plenty of availability tomorrow at 10 AM, 2 PM, and 4 PM."
    }]
  });
});

export default router;