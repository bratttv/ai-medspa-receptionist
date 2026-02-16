import twilio from "twilio";
import { formatInTimeZone } from "date-fns-tz";

const TIMEZONE = "America/Toronto";

/**
 ✅ HARD FAIL if credentials missing
 This prevents the server from running with broken auth.
*/
if (!process.env.TWILIO_ACCOUNT_SID) {
  throw new Error("TWILIO_ACCOUNT_SID is missing.");
}

if (!process.env.TWILIO_AUTH_TOKEN) {
  throw new Error("TWILIO_AUTH_TOKEN is missing.");
}

if (!process.env.TWILIO_PHONE_NUMBER) {
  throw new Error("TWILIO_PHONE_NUMBER is missing.");
}

/**
 🔥 Trim secrets to prevent hidden whitespace bugs
 (VERY common in Render / copy paste)
*/
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID.trim();
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN.trim();
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER.trim();

/**
 Create ONE client globally.
 Never recreate per request.
*/
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

console.log("✅ Twilio client initialized:", ACCOUNT_SID.substring(0,6));

export async function sendConfirmationSMS(
  to: string,
  name: string,
  date: string,
  service: string
) {

  try {

    /**
     Format date cleanly
    */
    const formattedDate = formatInTimeZone(
      new Date(date),
      TIMEZONE,
      "EEEE, MMMM do 'at' h:mm a"
    );

    const message = `Lumen Aesthetics: Your reservation has been reserved.

Date: ${formattedDate}
Service: ${service}

To finalize this exclusive booking, a fully refundable security deposit is required. Please complete this securely below.

Link: https://lumen-pay.com/secure-deposit/8392

Please ensure you have read our policy before finalizing your booking.
Parking is complimentary in the Green Garage (Level P2).
Valid government-issued ID is required upon entry.

We look forward to welcoming you.`;

    /**
     Nuclear phone cleaning
    */
    let cleanPhone = to.replace(/[^\d+]/g, "");

    if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+1${cleanPhone.replace(/^1/, "")}`;
    }

    console.log("📲 Attempting SMS to:", cleanPhone);

    const response = await client.messages.create({
      body: message,
      from: FROM_NUMBER,
      to: cleanPhone,
    });

    console.log("✅ SMS SENT. SID:", response.sid);

  } catch (error: any) {

    /**
     FULL ERROR — not the useless partial one
    */
    console.error("🚨 TWILIO FAILURE");
    console.error("Status:", error?.status);
    console.error("Code:", error?.code);
    console.error("Message:", error?.message);
    console.error("More Info:", error?.moreInfo);

    throw error; // bubble up so you SEE it
  }
}
