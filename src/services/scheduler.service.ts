import { supabase } from "./supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ⚠️ REPLACE THIS WITH YOUR REAL GOOGLE REVIEW LINK
const REVIEW_LINK = "https://g.page/r/YOUR_LINK_HERE/review"; 

export async function runScheduler() {
    console.log("Scheduler active...");

    try {
        // 1. CALCULATE 24 HOURS AGO
        // We look for appointments that ended BEFORE this timestamp.
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 2. FIND ELIGIBLE APPOINTMENTS
        // Status is confirmed + Ended > 24 hours ago + No link sent yet
        const { data: pastAppointments, error } = await supabase
            .from('appointments')
            .select('*')
            .eq('status', 'confirmed')
            .eq('review_sent', false)
            .lt('end_time', oneDayAgo); 

        if (error) {
            console.error("Scheduler Database Error:", error.message);
            return;
        }

        if (pastAppointments && pastAppointments.length > 0) {
            console.log(`Sending review requests to ${pastAppointments.length} clients...`);

            for (const appt of pastAppointments) {
                try {
                    // 3. SEND PROFESSIONAL SMS (No Emojis)
                    await client.messages.create({
                        body: `Hello ${appt.client_name}, thank you for choosing Lumen Aesthetics. We hope you are enjoying your results. We would value your feedback on your experience: ${REVIEW_LINK}`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: appt.client_phone
                    });

                    // 4. MARK AS SENT (Prevents Spam)
                    await supabase
                        .from('appointments')
                        .update({ review_sent: true })
                        .eq('id', appt.id);

                    console.log(`Review link sent to ${appt.client_name}`);

                } catch (smsError) {
                    console.error(`Failed to send SMS to ${appt.client_name}:`, smsError);
                }
            }
        } else {
            // Silent log to keep terminal clean
            // console.log("No review links to send right now.");
        }

    } catch (err: any) {
        console.error("Scheduler Critical Failure:", err.message);
    }
}