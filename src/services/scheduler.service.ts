import { supabase } from "./supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";
import { formatInTimeZone } from "date-fns-tz";

dotenv.config();

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TIMEZONE = "America/Toronto";

// ⚠️ REPLACE WITH REAL GOOGLE LINK
const REVIEW_LINK = "https://g.page/r/YOUR_LINK_HERE/review"; 

export async function runScheduler() {
    console.log("Scheduler active...");
    const now = new Date().toISOString();

    // ==========================================
    // 1. PRE-APPOINTMENT REMINDERS (24 Hours Before) ⏰
    // ==========================================
    try {
        const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const { data: upcomingAppts, error: reminderError } = await supabase
            .from('appointments')
            .select('*')
            .eq('status', 'confirmed')
            .eq('reminder_sent', false)
            .gt('start_time', now) 
            .lte('start_time', twentyFourHoursFromNow);

        if (upcomingAppts && upcomingAppts.length > 0) {
            console.log(`Sending reminders to ${upcomingAppts.length} clients...`);

            for (const appt of upcomingAppts) {
                try {
                    const readableDate = formatInTimeZone(
                        new Date(appt.start_time),
                        TIMEZONE,
                        "EEE, MMM d, h:mm a"
                    );

                    // ✨ UPDATED MESSAGE: No "Reply C". Passive Confirmation.
                    await client.messages.create({
                        body: `Reminder: You have an appointment with Lumen Aesthetics on ${readableDate}. \n\nWe look forward to seeing you. Please call us if you need to reschedule or cancel.`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: appt.client_phone
                    });

                    await supabase
                        .from('appointments')
                        .update({ reminder_sent: true })
                        .eq('id', appt.id);

                    console.log(`✅ Reminder sent to ${appt.client_name}`);

                } catch (smsError) {
                    console.error(`Failed to send reminder to ${appt.client_name}:`, smsError);
                }
            }
        }
    } catch (err: any) {
        console.error("Reminder Logic Error:", err.message);
    }

    // ==========================================
    // 2. POST-APPOINTMENT REVIEWS (24 Hours After) 🌟
    // ==========================================
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: pastAppointments, error: reviewError } = await supabase
            .from('appointments')
            .select('*')
            .eq('status', 'completed')
            .eq('review_sent', false)
            .lt('end_time', oneDayAgo); 

        if (pastAppointments && pastAppointments.length > 0) {
            console.log(`Sending review requests to ${pastAppointments.length} clients...`);

            for (const appt of pastAppointments) {
                try {
                    if (appt.status !== 'completed') {
                        continue;
                    }
                    await client.messages.create({
                        body: `Hello ${appt.client_name}, thank you for choosing Lumen Aesthetics. We hope you are enjoying your results. We would value your feedback: ${REVIEW_LINK}`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: appt.client_phone
                    });

                    await supabase
                        .from('appointments')
                        .update({ review_sent: true })
                        .eq('id', appt.id);

                    console.log(`✅ Review link sent to ${appt.client_name}`);

                } catch (smsError) {
                    console.error(`Failed to send review link to ${appt.client_name}:`, smsError);
                }
            }
        }
    } catch (err: any) {
        console.error("Review Logic Error:", err.message);
    }
}