'use strict';

// Anthropic Messages API. Used for slots 1-4 (opus-4.7, sonnet-4.6, haiku-4.5, opus-4.6).
async function callAnthropic({ apiKey, model, system, prompt, maxTokens = 1024, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  return {
    text,
    tokensIn: data.usage ? data.usage.input_tokens : 0,
    tokensOut: data.usage ? data.usage.output_tokens : 0,
  };
}

module.exports = { callAnthropic };
