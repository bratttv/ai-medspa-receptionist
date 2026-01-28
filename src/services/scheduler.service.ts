import { supabase } from "./supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ⚠️ REPLACE WITH REAL GOOGLE LINK
const REVIEW_LINK = "https://g.page/r/YOUR_LINK_HERE/review"; 

export async function runScheduler() {
    console.log("Scheduler active...");
    const now = new Date().toISOString();

    // ==========================================
    // 1. PRE-APPOINTMENT REMINDERS (24 Hours Before) ⏰
    // ==========================================
    try {
        // Look for appointments starting in the next 24 hours
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
                    // FIX: Create a professional date string (e.g., "Wed, Jan 28 at 10:00 AM")
                    // This prevents the "Tomorrow" bug if the appointment is actually today.
                    const readableDate = new Date(appt.start_time).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                        weekday: "short", month: "short", day: "numeric", 
                        hour: "numeric", minute: "2-digit"
                    });

                    await client.messages.create({
                        body: `Reminder: You have an appointment with Lumen Aesthetics on ${readableDate}. \n\nPlease arrive 5 minutes early. \nReply 'C' to Confirm.`,
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
            .eq('status', 'confirmed')
            .eq('review_sent', false)
            .lt('end_time', oneDayAgo); 

        if (pastAppointments && pastAppointments.length > 0) {
            console.log(`Sending review requests to ${pastAppointments.length} clients...`);

            for (const appt of pastAppointments) {
                try {
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