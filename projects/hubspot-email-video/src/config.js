'use strict';

const REQUIRED = [
  'HUBSPOT_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'SENDER_EMAIL',
];

function load(env = process.env) {
  const missing = REQUIRED.filter((k) => !env[k] || env[k].trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill in real values.`,
    );
  }

  return {
    hubspot: { token: env.HUBSPOT_TOKEN },
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_REFRESH_TOKEN,
    },
    sender: {
      email: env.SENDER_EMAIL,
      name: env.SENDER_NAME || env.SENDER_EMAIL,
    },
    calendar: {
      calendarId: env.CALENDAR_ID || 'primary',
      defaultMinutes: parseInt(env.DEFAULT_MEETING_MINUTES || '30', 10),
      timeZone: env.DEFAULT_TIMEZONE || 'UTC',
    },
  };
}

module.exports = { load, REQUIRED };
