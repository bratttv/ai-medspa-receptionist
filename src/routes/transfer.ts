import { Router } from "express";

const router = Router();

// YOUR REAL CELL PHONE NUMBER (The one the AI forwards to)
// Format: +1555...
const MANAGER_PHONE = "+14374405408"; 

router.post("/transfer", async (req, res) => {
  console.log("☎️ TRANSFER REQUESTED by User");

  // We return a message telling the AI to announce the transfer.
  // In the 'server-side' world, this log is where you'd trigger a real Twilio handoff if you were building custom voice.
  // For Vapi, this tool confirms the intent.
  
  return res.json({
    results: [{
      result: `Transfer approved. Tell the user: "I am connecting you to our office manager now. Please hold." and then stay silent.`
    }]
  });
});

export default router;