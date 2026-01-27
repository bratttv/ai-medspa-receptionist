import { Router } from "express";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();
const router = Router();

// Ensure these exist, or it crashes silently
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error("❌ FATAL: Twilio Credentials are MISSING.");
}

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

router.post("/notify_team", async (req, res) => {
  try {
    console.log("🔔 NOTIFY TEAM REQUEST RECEIVED");

    // 1. GET THE ID (The Missing Piece)
    const toolCallId = req.body.message.toolCalls?.[0]?.id;

    let params = {};
    const rawArgs = req.body.message.toolCalls?.[0]?.function?.arguments || req.body.message.functionCall?.parameters;
    if (rawArgs) {
        params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;
    }

    const { name, phone, date, time } = params as any;

    if (!phone) {
      console.error("❌ Error: Phone number is missing.");
      return res.json({ 
        results: [{
          toolCallId: toolCallId,
          result: "Failed: Phone number is required."
        }]
      });
    }

    console.log(`Sending SMS to ${phone}...`);
    
    await client.messages.create({
      body: `New Booking: ${name} on ${date} at ${time}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });

    console.log(`✅ SMS SENT!`);
    
    // 2. RETURN THE ID (Vapi will now be happy)
    return res.json({ 
      results: [{
        toolCallId: toolCallId,
        result: "Notification sent successfully."
      }]
    });

  } catch (error: any) {
    console.error("❌ TWILIO ERROR:", error.message);
    return res.json({ 
      results: [{
        toolCallId: req.body.message?.toolCalls?.[0]?.id,
        result: `Error sending SMS: ${error.message}`
      }]
    });
  }
});

export default router;