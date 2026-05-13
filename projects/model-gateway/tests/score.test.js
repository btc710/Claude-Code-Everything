'use strict';

const { scoreWithSlot } = require('../src/score');
const {
  assert, assertEqual, makeFakeFetch, cannedScore,
  anthropicShape, openaiCompatShape, geminiShape, FAKE_ENV,
} = require('./helpers');

const tests = [
  ['scores via the Anthropic shape for slot opus-4.7', async () => {
    const fetchImpl = makeFakeFetch([{
      match: u => u.includes('api.anthropic.com'),
      body: () => anthropicShape(cannedScore({ total: 912 })),
    }]);
    const r = await scoreWithSlot({ slotIdOrNumber: 'opus-4.7', plan: 'plan', env: FAKE_ENV, fetchImpl });
    assertEqual(r.slot, 'opus-4.7', 'slot id');
    assertEqual(r.score.total, 912, 'score total');
    assert(r.usage.tokensIn > 0, 'tokens recorded');
  }],
  ['scores via the OpenAI shape for slot gpt-5.0', async () => {
    const fetchImpl = makeFakeFetch([{
      match: u => u.includes('api.openai.com'),
      body: () => openaiCompatShape(cannedScore({ total: 853 })),
    }]);
    const r = await scoreWithSlot({ slotIdOrNumber: 'gpt-5.0', plan: 'plan', env: FAKE_ENV, fetchImpl });
    assertEqual(r.score.total, 853, 'total');
  }],
  ['scores via the Gemini shape for slot gemini-2.5-pro', async () => {
    const fetchImpl = makeFakeFetch([{
      match: u => u.includes('generativelanguage.googleapis.com'),
      body: () => geminiShape(cannedScore({ total: 823 })),
    }]);
    const r = await scoreWithSlot({ slotIdOrNumber: 'gemini-2.5-pro', plan: 'plan', env: FAKE_ENV, fetchImpl });
    assertEqual(r.score.total, 823, 'total');
  }],
  ['tolerant JSON parse handles code-fence prose', async () => {
    const wrapped = '```json\n' + JSON.stringify(cannedScore({ total: 781 })) + '\n```';
    const fetchImpl = makeFakeFetch([{
      match: u => u.includes('api.deepseek.com'),
      body: () => ({ choices: [{ message: { content: wrapped } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    }]);
    const r = await scoreWithSlot({ slotIdOrNumber: 'deepseek-v3', plan: 'plan', env: FAKE_ENV, fetchImpl });
    assertEqual(r.score.total, 781, 'total');
  }],
  ['missing vendor key throws a clear error', async () => {
    const fetchImpl = makeFakeFetch([]);
    let threw = null;
    try {
      await scoreWithSlot({ slotIdOrNumber: 'opus-4.7', plan: 'p', env: {}, fetchImpl });
    } catch (e) { threw = e; }
    assert(threw && /ANTHROPIC_API_KEY/.test(threw.message), `expected env error, got ${threw && threw.message}`);
  }],
];

module.exports = tests;
