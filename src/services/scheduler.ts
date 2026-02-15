import cron from 'node-cron';
import { supabase } from './supabase.service';
import Twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export const startScheduler = () => {

  console.log("Scheduler started.");

  cron.schedule('*/5 * * * *', async () => {

    try {

      const now = new Date();

      // ⭐ prevents brand-new bookings from triggering reminders
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // keep your existing window logic
      const windowStart = new Date(now.getTime() + (23.5 * 60 * 60 * 1000));
      const windowEnd   = new Date(now.getTime() + (24.5 * 60 * 60 * 1000));

      /**
       * ⭐ IMPORTANT CHANGE HERE
       * We update FIRST, then return rows.
       * This prevents duplicate texts if cron overlaps.
       */

      const { data: appts, error } = await supabase
        .from('appointments')
        .update({ reminder_sent: true })
        .eq('status', 'confirmed')
        .eq('reminder_sent', false)
        .lte('created_at', fiveMinutesAgo.toISOString())
        .gte('start_time', windowStart.toISOString())
        .lte('start_time', windowEnd.toISOString())
        .select('*');   // returns the rows we just locked

      if (error) {
        console.error("Scheduler DB error:", error.message);
        return;
      }

      if (!appts?.length) return;

      for (const appt of appts) {

        if (!appt.client_phone) continue;

        try {

          const timeString = new Date(appt.start_time)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          await client.messages.create({
            body: `Reminder: You have an appointment tomorrow at ${timeString}. Reply if you need to reschedule.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: appt.client_phone
          });

          console.log(`Reminder sent for appointment ${appt.id}`);

        } catch (smsErr:any) {

          console.error("SMS failure:", smsErr.message);

          // rollback so it retries next cron run
          await supabase
            .from('appointments')
            .update({ reminder_sent: false })
            .eq('id', appt.id);
        }
      }

    } catch (err:any) {

      console.error("Scheduler crash:", err.message);
    }

  });
};
