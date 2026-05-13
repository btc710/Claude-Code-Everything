'use strict';

// Email sink — SMTP-via-API stub modeled on Resend / SendGrid.
// `channel` is treated as the recipient address. `subject` becomes the
// email subject; `body` becomes plain-text content.

const ENDPOINT = 'https://api.resend.com/emails';

async function send({ channel, subject, body, meta = {} }, opts = {}) {
  if (!channel) throw new Error('email: channel (recipient) required');
  const fetchImpl = opts.fetchImpl || fetch;
  const apiKey = opts.apiKey || process.env.RESEND_API_KEY || '';
  const from = opts.from || process.env.ATLAS_NOTIFIER_FROM || 'atlas@example.com';

  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [channel],
      subject: subject || '(no subject)',
      text: body,
      headers: { 'X-Atlas-Meta': JSON.stringify(meta) },
    }),
  });
  if (!res.ok) {
    const detail = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`email ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return { ok: true, id: data && data.id ? data.id : null };
}

module.exports = { send, ENDPOINT };
