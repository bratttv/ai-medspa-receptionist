import { Router } from "express";
import Twilio from "twilio";

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Ensure you add TEAM_PHONE to your .env file!
const TEAM_PHONE = process.env.TEAM_PHONE || "+15555555555"; // Replace fallback with your real number

router.post("/notify_team", async (req, res) => {
  console.log("🔔 NOTIFY TEAM REQUEST RECEIVED");
  
  try {
    let args = req.body.message.functionCall?.parameters;
    if (!args && req.body.message.toolCalls) {
      args = JSON.parse(req.body.message.toolCalls[0].function.arguments);
    }

    const reason = args?.reason || "General Inquiry";
    const customerPhone = args?.phone || "Unknown Number";
    const customerName = args?.name || "Unknown Client";

    const messageBody = `🚨 TEAM ALERT: Please call back ${customerName} at ${customerPhone}. Reason: ${reason}`;

    // Send SMS to YOU (The Business)
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
    return res.json({ results: [{ result: "Notification failed." }] });
  }
});

export default router;