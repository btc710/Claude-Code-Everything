'use strict';

// Gemini API (AI Studio). Used for slots 7-8.
async function callGemini({ apiKey, model, system, prompt, maxTokens = 1024, fetchImpl = fetch }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content
    ? data.candidates[0].content.parts || []
    : [];
  const text = parts.map(p => p.text || '').join('');
  const usage = data.usageMetadata || {};
  return {
    text,
    tokensIn:  usage.promptTokenCount     || 0,
    tokensOut: usage.candidatesTokenCount || 0,
  };
}

module.exports = { callGemini };
