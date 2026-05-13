'use strict';

// Generic webhook sink — POSTs the full digest payload to whatever URL the
// tenant configures. `channel` is the URL. The body is sent as JSON so the
// receiver can route to its own internal system.

async function send({ channel, subject, body, meta = {} }, opts = {}) {
  if (!channel) throw new Error('webhook: channel (url) required');
  if (!/^https?:\/\//.test(channel)) throw new Error(`webhook: invalid url ${channel}`);
  const fetchImpl = opts.fetchImpl || fetch;
  const headers = Object.assign(
    { 'content-type': 'application/json' },
    opts.headers || {},
  );
  if (opts.secret) headers['x-atlas-signature'] = String(opts.secret);

  const res = await fetchImpl(channel, {
    method: 'POST',
    headers,
    body: JSON.stringify({ subject, body, meta }),
  });
  if (!res.ok) {
    const detail = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`webhook ${res.status}: ${detail}`);
  }
  return { ok: true };
}

module.exports = { send };
