import { supabase } from "./supabase.service";
import Twilio from "twilio";

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const REVIEW_LINK = "https://g.page/r/https://www.google.com/search?q=med+spa&oq=med+spa+&gs_lcrp=EgZjaHJvbWUyDggAEEUYJxg5GIAEGIoFMgoIARAAGJIDGIAEMgoIAhAAGJIDGIAEMgcIAxAAGIAEMgcIBBAAGIAEMgYIBRBFGDwyBggGEEUYPTIGCAcQRRg90gEIMTM4OWowajeoAgCwAgA&sourceid=chrome&ie=UTF-8&lqi=#rlimm=17293222714978146602&lrd=0x882b34cd8be7954f:0xeffdde6f93fd192a,3,,,,"
export async function runScheduler() {
    console.log("⏰ Scheduler waking up...");

    // 1. SEND REMINDERS (24 Hours Before)
    // ... (Your existing reminder logic would go here, or we can add it if missing)

    // 2. SEND REVIEW REQUESTS (2 Hours After) ⭐️
    // Logic: Find appointments that ended > 2 hours ago AND haven't received a link yet.
    
    // Get time 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: pastAppointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'confirmed')
        .eq('review_sent', false)
        .lt('end_time', twoHoursAgo); // Ended before 2 hours ago

    if (error) {
        console.error("Scheduler Error:", error.message);
        return;
    }

    if (pastAppointments && pastAppointments.length > 0) {
        console.log(`🚀 Sending review links to ${pastAppointments.length} clients...`);

        for (const appt of pastAppointments) {
            try {
                // Send SMS
                await client.messages.create({
                    body: `Hi ${appt.client_name}, thanks for visiting Lumen Aesthetics! 🌟 We'd love to hear about your experience: ${REVIEW_LINK}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: appt.client_phone
                });

                // Mark as Sent (So we don't spam them)
                await supabase
                    .from('appointments')
                    .update({ review_sent: true })
                    .eq('id', appt.id);

                console.log(`✅ Review link sent to ${appt.client_name}`);

            } catch (err) {
                console.error(`❌ Failed to send to ${appt.client_name}:`, err);
            }
        }
    } else {
        console.log("💤 No review links to send right now.");
    }
}