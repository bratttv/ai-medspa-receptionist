// src/services/sms.service.ts
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

export async function sendConfirmationSMS(to: string, name: string, date: string, service: string) {
  if (!accountSid || !authToken || !fromPhone) {
    console.warn("⚠️ Twilio credentials missing. Skipping SMS.");
    return;
  }

  // Format the date nicely (e.g., "Sunday, Jan 25 at 9:00 AM")
  const dateObj = new Date(date);
  const dateString = dateObj.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const message = `Hi ${name}, your appointment for ${service} at Lumen Aesthetics is confirmed for ${dateString}. Please arrive 10 mins early. Reply C to confirm.`;

  try {
    // Basic phone cleaning (removes spaces/dashes)
    const cleanPhone = to.replace(/[^\d+]/g, ""); 
    
    await client.messages.create({
      body: message,
      from: fromPhone,
      to: cleanPhone,
    });
    console.log(`✅ SMS sent to ${cleanPhone}`);
  } catch (error) {
    console.error("❌ Failed to send SMS:", error);
  }
}