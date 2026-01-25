import cron from "node-cron";
import { supabase } from "./supabase.service";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// 🅿️ PARKING & INSURANCE INFO
const PARKING_MSG = "🚗 PARKING: Free validation in the Green Garage (Level P2).";
const REVIEW_LINK = "https://g.page/r/YourBusiness/review"; // Replace with your Google Review link

export function startScheduler() {
  console.log("⏰ Cron Scheduler Started: Checking for reminders/reviews every 10 mins...");

  // Run every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    await sendReminders();
    await sendReviewLinks();
  });
}

// 1️⃣ 24-HOUR REMINDERS
async function sendReminders() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowBuffer = new Date(tomorrow.getTime() + 20 * 60 * 1000); // 20 min window

  // Find appts roughly 24hrs from now that haven't been reminded
  const { data: upcoming } = await supabase
    .from('appointments')
    .select('*')
    .eq('reminder_sent', false)
    .neq('status', 'cancelled')
    .gte('start_time', tomorrow.toISOString())
    .lte('start_time', tomorrowBuffer.toISOString());

  if (upcoming && upcoming.length > 0) {
    for (const appt of upcoming) {
      const msg = `Hi ${appt.client_name}, reminder for your ${appt.service_type} tomorrow at ${new Date(appt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.\n\n${PARKING_MSG}\n\nSee you soon!`;
      
      try {
        await client.messages.create({ body: msg, from: process.env.TWILIO_PHONE_NUMBER, to: appt.client_phone });
        // Mark as sent so we don't text them again
        await supabase.from('appointments').update({ reminder_sent: true }).eq('id', appt.id);
        console.log(`✅ Reminder sent to ${appt.client_name}`);
      } catch (e) { console.error("Failed to send reminder:", e); }
    }
  }
}

// 2️⃣ POST-APPOINTMENT REVIEWS (2 Hours After)
async function sendReviewLinks() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const buffer = new Date(twoHoursAgo.getTime() - 20 * 60 * 1000); // Look back 20 mins

  const { data: finished } = await supabase
    .from('appointments')
    .select('*')
    .eq('review_sent', false)
    .neq('status', 'cancelled')
    .lte('start_time', twoHoursAgo.toISOString()) // Started > 2 hrs ago
    .gte('start_time', buffer.toISOString());

  if (finished && finished.length > 0) {
    for (const appt of finished) {
      const msg = `Hi ${appt.client_name}, thanks for visiting Lumen! How did we do?\n\n⭐⭐⭐⭐⭐ leave a review here: ${REVIEW_LINK}`;
      
      try {
        await client.messages.create({ body: msg, from: process.env.TWILIO_PHONE_NUMBER, to: appt.client_phone });
        await supabase.from('appointments').update({ review_sent: true }).eq('id', appt.id);
        console.log(`⭐ Review link sent to ${appt.client_name}`);
      } catch (e) { console.error("Failed to send review link:", e); }
    }
  }
}