import { supabase } from "./supabase.service";
import Twilio from "twilio";

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// Ensure you have your link set here
const REVIEW_LINK = "https://g.page/r/YOUR_GOOGLE_LINK_HERE/review"; 

export async function runScheduler() {
    console.log("Scheduler active...");

    // 2. SEND REVIEW REQUESTS (2 Hours After)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: pastAppointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'confirmed')
        .eq('review_sent', false)
        .lt('end_time', twoHoursAgo);

    if (error) {
        console.error("Scheduler Error:", error.message);
        return;
    }

    if (pastAppointments && pastAppointments.length > 0) {
        console.log(`Sending review links to ${pastAppointments.length} clients...`);

        for (const appt of pastAppointments) {
            try {
                await client.messages.create({
                    body: `Hello ${appt.client_name}, thank you for choosing Lumen Aesthetics. We would value your feedback on your experience: ${REVIEW_LINK}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: appt.client_phone
                });

                await supabase
                    .from('appointments')
                    .update({ review_sent: true })
                    .eq('id', appt.id);

                console.log(`Review link sent to ${appt.client_name}`);

            } catch (err) {
                console.error(`Failed to send to ${appt.client_name}:`, err);
            }
        }
    }
}