'use strict';

const GMAIL_SEND_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

class GmailError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GmailError';
    this.status = status;
    this.body = body;
  }
}

function createClient({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google client credentials are required');
  }

  let cachedToken = null;
  let cachedExpiresAt = 0;

  async function getAccessToken() {
    if (cachedToken && now() < cachedExpiresAt - 30_000) return cachedToken;
    const res = await fetchImpl(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new GmailError('Failed to refresh Google access token', res.status, data);
    }
    cachedToken = data.access_token;
    cachedExpiresAt = now() + data.expires_in * 1000;
    return cachedToken;
  }

  async function send({ from, to, subject, htmlBody, textBody }) {
    if (!from) throw new Error('from is required');
    if (!to || (Array.isArray(to) && to.length === 0)) throw new Error('to is required');
    if (!subject) throw new Error('subject is required');

    const token = await getAccessToken();
    const raw = buildMime({ from, to, subject, htmlBody, textBody });

    const res = await fetchImpl(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new GmailError(`Gmail send failed: ${res.status}`, res.status, data);
    }
    return data;
  }

  return { send, _getAccessToken: getAccessToken };
}

function buildMime({ from, to, subject, htmlBody, textBody }) {
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const boundary = `hev_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const hasHtml = Boolean(htmlBody);
  const hasText = Boolean(textBody);
  const text = textBody || stripHtml(htmlBody || '');

  const lines = [
    `From: ${from}`,
    `To: ${recipients}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];

  if (hasHtml && hasText) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(text);
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(htmlBody);
    lines.push(`--${boundary}--`);
  } else if (hasHtml) {
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(htmlBody);
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push('Content-Transfer-Encoding: 7bit');
    lines.push('');
    lines.push(text);
  }

  const message = lines.join('\r\n');
  return base64UrlEncode(message);
}

function encodeHeader(value) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, '\n')
    .replace(/<br\s*\/?>(?:\n)?/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

module.exports = { createClient, buildMime, base64UrlEncode, stripHtml, GmailError };
