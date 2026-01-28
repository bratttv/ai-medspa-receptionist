import { Router } from "express";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const router = Router();
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

router.post("/send_insurance", async (req, res) => {
  try {
    console.log("--- SENDING INSURANCE LINK ---");

    const toolCallId = req.body.message.toolCalls?.[0]?.id;
    let params = {};
    const rawArgs = req.body.message.functionCall?.parameters || req.body.message.toolCalls?.[0]?.function?.arguments;
    if (rawArgs) params = (typeof rawArgs === 'string') ? JSON.parse(rawArgs) : rawArgs;

    const { phone } = params as any;

    if (!phone) throw new Error("Missing phone number.");

    // Send the Secure Link
    await client.messages.create({
        body: `Lumen Aesthetics: 🔒 Here is your secure link to upload your insurance card:\n\nhttps://lumen-secure-upload.com/upload\n\nThis form is encrypted for your privacy.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
    });

    return res.json({
        results: [{
            toolCallId: toolCallId,
            result: "Link sent successfully."
        }]
    });

  } catch (error: any) {
    console.error("Insurance SMS Error:", error);
    return res.json({
        results: [{
            toolCallId: req.body.message.toolCalls?.[0]?.id,
            result: "error sending link"
        }]
    });
  }
});

export default router;