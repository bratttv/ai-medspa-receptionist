// src/services/sms.service.ts
import twilio from "twilio";
import dotenv from "dotenv";
import { formatInTimeZone } from "date-fns-tz";

dotenv.config();

console.log("DEBUG SID:", process.env.TWILIO_ACCOUNT_SID ? "Found it ✅" : "MISSING ❌");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TIMEZONE = "America/Toronto";

export async function sendConfirmationSMS(to: string, name: string, date: string, service: string) {
  
  // 1. Format the date professionally (e.g. Tuesday, February 10th at 2:00 PM)
  const dateObj = new Date(date);
  const formattedDate = formatInTimeZone(dateObj, TIMEZONE, "EEEE, MMMM do 'at' h:mm a");

  // 2. The Premium Message (No Emojis, Direct Link)
  const message = `Lumen Aesthetics: Your reservation has been reserved.

Date: ${formattedDate}
Service: ${service}

To finalize this exclusive booking, a fully refundable security deposit is required. Please complete this securely below.

Link: https://lumen-pay.com/secure-deposit/8392

Please  ensure you have read our policy before finalizing your booking. 
Parking is complimentary in the Green Garage (Level P2).
Valid government-issued ID is required upon entry.
Thank you for choosing us & We look forward to welcoming you.`;

  try {
    // 3. "Nuclear" Phone Cleaning (Ensures delivery)
    let cleanPhone = to.replace(/[^\d+]/g, ""); // Remove non-digits/plus
    if (!cleanPhone.startsWith("+")) cleanPhone = `+1${cleanPhone.replace(/^1/, "")}`; // Ensure +1

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: cleanPhone,
    });
    console.log(`✅ Premium Confirmation SMS sent to ${cleanPhone}`);
  } catch (error) {
    console.error("❌ SMS Failed:", error);
  }
}