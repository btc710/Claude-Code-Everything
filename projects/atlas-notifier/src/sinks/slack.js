'use strict';

// Slack sink — posts to Slack via chat.postMessage.
// Auth via env (SLACK_BOT_TOKEN) so tests can omit it when fetchImpl is faked.

const ENDPOINT = 'https://slack.com/api/chat.postMessage';

async function send({ channel, subject, body, meta = {} }, opts = {}) {
  if (!channel) throw new Error('slack: channel required');
  const fetchImpl = opts.fetchImpl || fetch;
  const token = opts.token || process.env.SLACK_BOT_TOKEN || '';
  const text = subject ? `*${subject}*\n${body}` : body;

  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text, metadata: meta }),
  });
  if (!res.ok) {
    const detail = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`slack ${res.status}: ${detail}`);
  }
  const data = await res.json();
  // Slack returns 200 with { ok: false, error: '...' } on logical errors.
  if (data && data.ok === false) throw new Error(`slack: ${data.error || 'unknown'}`);
  return { ok: true, ts: data && data.ts ? data.ts : null };
}

module.exports = { send, ENDPOINT };
