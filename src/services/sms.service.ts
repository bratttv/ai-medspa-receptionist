// src/services/sms.service.ts
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// 🏥 PRE-CARE RULES: Map exact service names to instructions
const PRE_CARE_INSTRUCTIONS: Record<string, string> = {
  "Botox": "avoid alcohol 24hrs before and do not lay down for 4hrs after.",
  "Facial": "discontinue Retinol/AHA products 3 days prior.",
  "Filler": "avoid blood thinners (aspirin/ibuprofen) for 3 days prior to reduce bruising.",
  "Consultation": "please bring a list of your current skincare products."
};

const INSURANCE_LINK = "https://lumen-medspa.com/secure-intake"; // Replace with your real link later

export async function sendConfirmationSMS(to: string, name: string, date: string, service: string) {
  // 1. Pick the right instruction (or use a default)
  const instructions = PRE_CARE_INSTRUCTIONS[service] || "please arrive 10 mins early.";
  
  // 2. Format the date nicely
  const dateObj = new Date(date);
  const dateString = dateObj.toLocaleString("en-US", { 
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true 
  });

  // 3. Create the Smart Message
  const message = `Hi ${name}, confirmed: ${service} at Lumen on ${dateString}.\n\n` +
                  `⚠️ PRE-CARE: Please ${instructions}\n\n` +
                  `📋 REQUIRED: Upload insurance/ID here: ${INSURANCE_LINK}\n\n` +
                  `Reply 'C' to confirm your attendance.`;

  try {
    // Basic phone cleaning to ensure +1 format
    let cleanPhone = to.replace(/[^\d+]/g, "");
    if (!cleanPhone.startsWith("+")) cleanPhone = `+1${cleanPhone.replace(/^1/, "")}`;

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: cleanPhone,
    });
    console.log(`✅ Smart SMS sent to ${cleanPhone}`);
  } catch (error) {
    console.error("❌ SMS Failed:", error);
  }
}