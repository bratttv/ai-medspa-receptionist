import { Router } from "express";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// You can hardcode your number here for testing if you want
const TEAM_PHONE = process.env.TEAM_PHONE || "+15555555555"; 

router.post("/notify_team", async (req, res) => {
  console.log("🔔 NOTIFY TEAM REQUEST RECEIVED");
  
  try {
    let args;

    // 🛡️ SAFE PARSING LOGIC (Fixes the crash)
    if (req.body.message.functionCall?.parameters) {
      args = req.body.message.functionCall.parameters;
    } else if (req.body.message.toolCalls) {
      const rawArgs = req.body.message.toolCalls[0].function.arguments;
      
      // CHECK: Is it already an object?
      if (typeof rawArgs === 'object') {
        args = rawArgs; // Use it directly
      } else {
        args = JSON.parse(rawArgs); // It's a string, so parse it
      }
    }

    const reason = args?.reason || "General Inquiry";
    const customerPhone = args?.phone || "Unknown Number";
    const customerName = args?.name || "Unknown Client";

    const messageBody = `🚨 TEAM ALERT: Please call back ${customerName} at ${customerPhone}. Reason: ${reason}`;
    
    console.log(`Sending SMS to ${TEAM_PHONE}...`);

    await client.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: TEAM_PHONE,
    });

    return res.json({
      results: [{
        result: "I have messaged the team. They will contact you shortly."
      }]
    });

  } catch (error) {
    console.error("Notify Error:", error);
    // Return a safe response so the call doesn't drop
    return res.json({ results: [{ result: "I have noted your request." }] });
  }
});

export default router;