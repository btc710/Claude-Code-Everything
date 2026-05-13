# hubspot-email-video

Schedule a Google Meet video call from a HubSpot contact and email them the
invite. Designed for the "got a lead, want to discuss the project on video"
workflow.

## What it does

Given a HubSpot contact email and a start time, the tool will:

1. Look up the contact in HubSpot to get the name and context.
2. Create a Google Calendar event with a Google Meet link, with the contact as
   an attendee (Calendar will send its own native invite).
3. Send a personalized email via Gmail with the Meet link and a short note.
4. Log a note on the HubSpot contact recording when, why, and where.

If the email is not in HubSpot, steps 2 and 3 still run; step 4 is skipped.

## Setup

```bash
cd projects/hubspot-email-video
cp .env.example .env
# Fill in HUBSPOT_TOKEN and Google OAuth credentials
```

Required env vars (see `.env.example`):

- `HUBSPOT_TOKEN` — Private App token with contact/note read+write scopes.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` — OAuth
  client + refresh token with `calendar.events` and `gmail.send` scopes.
- `SENDER_EMAIL`, `SENDER_NAME` — the mailbox the token authorizes.
- `CALENDAR_ID` — default `primary`.
- `DEFAULT_MEETING_MINUTES` — default `30`.
- `DEFAULT_TIMEZONE` — IANA zone (e.g. `America/Chicago`).

## Usage

```bash
node src/index.js schedule \
  --contact alex@acme.com \
  --start 2026-05-20T15:00:00-05:00 \
  --minutes 30 \
  --subject "Acme project discussion" \
  --notes "Walk through scope and timeline"
```

Output:

```
Meeting scheduled.
  Google Meet : https://meet.google.com/abc-defg-hij
  Calendar    : https://calendar.google.com/event?eid=...
  Email id    : 192b8c...
  HubSpot     : contact 12345, note 67890
```

## Module layout

```
src/
  config.js        env loader + validation
  hubspot.js       HubSpot REST client (search contacts, add notes)
  calendar.js      Google Calendar + Meet (OAuth refresh + event create)
  gmail.js         Gmail send (MIME builder + OAuth)
  orchestrator.js  end-to-end flow + email templates
  index.js         CLI entry
tests/
  *.test.js        unit + orchestrator tests
  run-all.js       runner — `node tests/run-all.js`
```

## Testing

```bash
node tests/run-all.js
```

All tests use a `fakeFetch` so they run with no network access and no real
credentials.

## Notes

- Calendar events are created with `sendUpdates=all`, so attendees get the
  native Google Calendar invite in addition to the email this tool sends. If
  that double-notification is undesirable, change `sendUpdates` in
  `src/calendar.js`.
- The Meet link is extracted from the `conferenceData.entryPoints` array
  (preferring the `video` entry, falling back to `hangoutLink`).
