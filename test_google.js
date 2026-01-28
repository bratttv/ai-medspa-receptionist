require('dotenv').config();
const { google } = require('googleapis');

const calendar = google.calendar({ version: "v3" });
const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    undefined,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
);

async function test() {
    try {
        const res = await calendar.events.list({
            auth: auth,
            calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
            timeMin: new Date().toISOString(),
            maxResults: 1,
            singleEvents: true,
            orderBy: 'startTime',
        });
        console.log('✅ SUCCESS! Connected to Calendar.');
        console.log('Next event:', res.data.items[0]?.summary || 'No upcoming events found (but connection works!)');
    } catch (error) {
        console.error('❌ FAILURE:', error.message);
    }
}

test();