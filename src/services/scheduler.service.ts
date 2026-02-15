import { supabase } from "./supabase.service";
import Twilio from "twilio";
import dotenv from "dotenv";
import { formatInTimeZone } from "date-fns-tz";


dotenv.config();

console.log("DEBUG SID:", process.env.TWILIO_ACCOUNT_SID ? "Found it ✅" : "MISSING ❌");
const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TIMEZONE = "America/Toronto";
const sentReceipts = new Set<string>();

// ⚠️ REPLACE WITH YOUR REAL GOOGLE REVIEW LINK
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
            console.log(`📬 Sending reminders to ${upcomingAppts.length} clients...`);

            for (const appt of upcomingAppts) {
                try {
                    if (!appt.client_phone) {
                        continue;
                    }
                    if (sentReceipts.has(`reminder:${appt.id}`)) {
                        continue;
                    }

                    const { data: claimed, error: claimError } = await supabase
                        .from('appointments')
                        .update({ reminder_sent: true })
                        .eq('id', appt.id)
                        .eq('reminder_sent', false)
                        .select('client_name, client_phone, start_time');

                    if (claimError || !claimed || claimed.length === 0) {
                        continue;
                    }

                    const claimedAppt = claimed[0];
                    const readableDate = formatInTimeZone(
                        new Date(claimedAppt.start_time),
                        TIMEZONE,
                        "EEE, MMM d, h:mm a"
                    );

                    await client.messages.create({
                        body: `Reminder: You have an appointment with Lumen Aesthetics on ${readableDate}. \n\nWe look forward to seeing you. Please call us if you need to reschedule or cancel.`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: claimedAppt.client_phone
                    });

                    sentReceipts.add(`reminder:${appt.id}`);
                    console.log(`✅ Reminder sent to ${claimedAppt.client_name}`);

                } catch (smsError) {
                    console.error(`Failed to send reminder to ${appt.client_name}:`, smsError);
                }
            }
        }
    } catch (err: any) {
        console.error("Reminder Logic Error:", err.message);
    }

    // ==========================================
    // 2. AUTO-COMPLETE PAST APPOINTMENTS ✅ NEW!
    // ==========================================
    // This fixes the bug where reviews never sent because
    // nothing was changing status from 'confirmed' to 'completed'
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const { data: pastAppts, error: completeError } = await supabase
            .from('appointments')
            .select('id, client_name')
            .eq('status', 'confirmed')
            .lt('end_time', oneHourAgo); // Appointment ended 1+ hour ago

        if (pastAppts && pastAppts.length > 0) {
            console.log(`🔄 Auto-completing ${pastAppts.length} past appointments...`);

            for (const appt of pastAppts) {
                await supabase
                    .from('appointments')
                    .update({ status: 'completed' })
                    .eq('id', appt.id);

                console.log(`✅ Auto-completed: ${appt.client_name}`);
            }
        }
    } catch (err: any) {
        console.error("Auto-complete Error:", err.message);
    }

    // ==========================================
    // 3. POST-APPOINTMENT REVIEWS (24 Hours After) 🌟
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
            console.log(`⭐ Sending review requests to ${pastAppointments.length} clients...`);

            for (const appt of pastAppointments) {
                try {
                    if (!appt.client_phone) {
                        continue;
                    }
                    if (sentReceipts.has(`review:${appt.id}`)) {
                        continue;
                    }

                    const { data: claimed, error: claimError } = await supabase
                        .from('appointments')
                        .update({ review_sent: true })
                        .eq('id', appt.id)
                        .eq('review_sent', false)
                        .select('client_name, client_phone');

                    if (claimError || !claimed || claimed.length === 0) {
                        continue;
                    }

                    const claimedAppt = claimed[0];
                    await client.messages.create({
                        body: `Hello ${claimedAppt.client_name}, thank you for choosing Lumen Aesthetics. We hope you're loving your results! If you have a moment, we'd truly appreciate your feedback: ${REVIEW_LINK}`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: claimedAppt.client_phone
                    });

                    sentReceipts.add(`review:${appt.id}`);
                    console.log(`✅ Review link sent to ${claimedAppt.client_name}`);

                } catch (smsError) {
                    console.error(`Failed to send review link to ${appt.client_name}:`, smsError);
                }
            }
        }
    } catch (err: any) {
        console.error("Review Logic Error:", err.message);
    }

}