'use strict';

const hubspotMod = require('./hubspot');
const calendarMod = require('./calendar');
const gmailMod = require('./gmail');

function buildInviteHtml({ recipientName, senderName, meetUrl, startIso, timeZone, eventLink, notes }) {
  const start = formatWhen(startIso, timeZone);
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  const notesBlock = notes
    ? `<p><strong>Agenda / context:</strong><br>${escapeHtml(notes).replace(/\n/g, '<br>')}</p>`
    : '';
  return [
    '<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5; color: #1f2937;">',
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>I&rsquo;d love to walk through the project together. I&rsquo;ve set up a quick video call so we can discuss the details.</p>`,
    `<p><strong>When:</strong> ${escapeHtml(start)}<br>`,
    `<strong>Where:</strong> <a href="${escapeAttr(meetUrl)}">${escapeHtml(meetUrl)}</a></p>`,
    notesBlock,
    `<p>If that time doesn&rsquo;t work, reply with a couple of windows that do and I&rsquo;ll rebook. The event is also on your calendar: `,
    `<a href="${escapeAttr(eventLink)}">view event</a>.</p>`,
    `<p>Talk soon,<br>${escapeHtml(senderName)}</p>`,
    '</div>',
  ].join('\n');
}

function buildInviteText({ recipientName, senderName, meetUrl, startIso, timeZone, eventLink, notes }) {
  const start = formatWhen(startIso, timeZone);
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
  const notesBlock = notes ? `\nAgenda / context:\n${notes}\n` : '';
  return [
    greeting,
    '',
    "I'd love to walk through the project together. I've set up a quick video call so we can discuss the details.",
    '',
    `When: ${start}`,
    `Where: ${meetUrl}`,
    notesBlock,
    `Event link: ${eventLink}`,
    '',
    "If that time doesn't work, reply with a couple of windows that do and I'll rebook.",
    '',
    'Talk soon,',
    senderName,
  ].join('\n');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function formatWhen(iso, timeZone) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    });
  } catch (_) {
    return iso;
  }
}

async function scheduleProjectDiscussion({
  config,
  contactEmail,
  startTime,
  durationMinutes,
  subject,
  notes,
  deps = {},
}) {
  const hubspot =
    deps.hubspot || hubspotMod.createClient({ token: config.hubspot.token });
  const calendar = deps.calendar || calendarMod.createClient(config.google);
  const gmail = deps.gmail || gmailMod.createClient(config.google);

  const minutes = durationMinutes || config.calendar.defaultMinutes;
  const endTime = calendarMod.computeEndTime(startTime, minutes);

  const contact = await hubspot.findContactByEmail(contactEmail);
  const recipientName = contact ? hubspotMod.contactDisplayName(contact) : null;

  const eventSubject = subject || `Project discussion with ${recipientName || contactEmail}`;
  const event = await calendar.createMeetingEvent({
    calendarId: config.calendar.calendarId,
    summary: eventSubject,
    description:
      (notes ? `${notes}\n\n` : '') +
      `Scheduled via hubspot-email-video.\nContact: ${contactEmail}` +
      (contact ? ` (HubSpot ID ${contact.id})` : ''),
    startTime,
    endTime,
    timeZone: config.calendar.timeZone,
    attendees: [contactEmail],
  });

  if (!event.meetUrl) {
    throw new Error('Calendar event was created but no Google Meet URL was returned');
  }

  const fromHeader = config.sender.name
    ? `${config.sender.name} <${config.sender.email}>`
    : config.sender.email;

  const emailResult = await gmail.send({
    from: fromHeader,
    to: contactEmail,
    subject: eventSubject,
    htmlBody: buildInviteHtml({
      recipientName,
      senderName: config.sender.name,
      meetUrl: event.meetUrl,
      startIso: startTime,
      timeZone: config.calendar.timeZone,
      eventLink: event.htmlLink,
      notes,
    }),
    textBody: buildInviteText({
      recipientName,
      senderName: config.sender.name,
      meetUrl: event.meetUrl,
      startIso: startTime,
      timeZone: config.calendar.timeZone,
      eventLink: event.htmlLink,
      notes,
    }),
  });

  let note = null;
  if (contact) {
    note = await hubspot.addNoteToContact({
      contactId: contact.id,
      body:
        `Scheduled project discussion call.\n` +
        `When: ${formatWhen(startTime, config.calendar.timeZone)}\n` +
        `Meet: ${event.meetUrl}\n` +
        `Calendar: ${event.htmlLink}` +
        (notes ? `\n\nAgenda:\n${notes}` : ''),
    });
  }

  return {
    contact,
    event,
    email: emailResult,
    note,
  };
}

module.exports = {
  scheduleProjectDiscussion,
  buildInviteHtml,
  buildInviteText,
  formatWhen,
};
