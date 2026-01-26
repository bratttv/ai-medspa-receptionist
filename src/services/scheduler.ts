import cron from 'node-cron';
import { supabase } from './supabase.service';
import Twilio from 'twilio';
import dotenv from 'dotenv';
import { addHours, subMinutes, addMinutes } from 'date-fns';

dotenv.config();

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// 👇 YOUR CUSTOM INFO
const PARKING_INFO = "Free parking is available at the back.";
const ADDRESS = "123 Main St, Suite 100";

export const startScheduler = () => {
  console.log("⏰ Scheduler started: Checking for reminders every hour.");

  cron.schedule('0 * * * *', async () => {
    console.log("⏰ Running hourly reminder check...");

    const now = new Date();
    // Window: 23.5 to 24.5 hours from now
    const windowStart = addHours(subMinutes(now, 30), 24);
    const windowEnd = addHours(addMinutes(now, 30), 24);

    try {
      const { data: upcomingAppts, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'confirmed')
        .is('reminder_sent', false)
        .gte('start_time', windowStart.toISOString())
        .lte('start_time', windowEnd.toISOString());

      if (error) { console.error("Supabase check failed:", error); return; }
      if (!upcomingAppts || upcomingAppts.length === 0) return;

      console.log(`Found ${upcomingAppts.length} appointments needing reminders.`);

      for (const appt of upcomingAppts) {
        if (!appt.client_phone) continue;

        const timeString = new Date(appt.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // 👇 HERE IS YOUR NEW MESSAGE FORMAT
        const msg = `Hi ${appt.client_name}, reminder for your appointment tomorrow at ${timeString}. 
        
📍 ${ADDRESS}
🚗 ${PARKING_INFO}

If you need to reschedule, please call us immediately to find a new time. See you soon!`;
        
        await client.messages.create({
          body: msg,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: appt.client_phone
        });

        console.log(`✅ Reminder sent to ${appt.client_name}`);

        await supabase
          .from('appointments')
          .update({ reminder_sent: true })
          .eq('id', appt.id);
      }

    } catch (err) {
      console.error("❌ Scheduler Error:", err);
    }
  });
};