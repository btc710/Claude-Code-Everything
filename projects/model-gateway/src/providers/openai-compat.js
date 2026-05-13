'use strict';

// One client for every OpenAI-compatible API: OpenAI itself, xAI, DeepSeek,
// Together (Llama), and Mistral all accept the same /chat/completions shape.
const BASE_URLS = {
  openai:   'https://api.openai.com/v1',
  xai:      'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  together: 'https://api.together.xyz/v1',
  mistral:  'https://api.mistral.ai/v1',
};

async function callOpenAICompat({ provider, apiKey, model, system, prompt, maxTokens = 1024, fetchImpl = fetch }) {
  const base = BASE_URLS[provider];
  if (!base) throw new Error(`unsupported openai-compat provider ${provider}`);
  const res = await fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content || ''
    : '';
  return {
    text,
    tokensIn:  data.usage ? data.usage.prompt_tokens     : 0,
    tokensOut: data.usage ? data.usage.completion_tokens : 0,
  };
}

module.exports = { callOpenAICompat };
