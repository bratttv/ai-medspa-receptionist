import { Router } from "express";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

router.post("/notify_team", async (req, res) => {
  console.log("--- TEAM NOTIFICATION ---");

  try {
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;

    const { name, phone, reason } = params as any;
    
    // Fallback logic to prevent "undefined" messages
    const clientName = name || "A Client";
    const clientPhone = phone || "Unknown Number";
    const issue = reason || "requires assistance";

    console.log(`Notifying team about: ${clientName}`);

    if (process.env.TEAM_PHONE) {
        await client.messages.create({
            body: `ACTION REQUIRED\nWho: ${clientName} (${clientPhone})\nIssue: ${issue}\n\nPlease contact them immediately.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: process.env.TEAM_PHONE
        });
    }

    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "Team notified via SMS."
        }]
    });

  } catch (error: any) {
    console.error("Notify Error:", error);
    return res.json({ result: "Error sending notification" });
  }
});

export default router;