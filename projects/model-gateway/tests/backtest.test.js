'use strict';

const { runBacktest } = require('../src/backtest');
const { Ledger } = require('../src/ledger');
const {
  assert, assertEqual, makeFakeFetch, cannedScore,
  anthropicShape, openaiCompatShape, geminiShape, FAKE_ENV,
} = require('./helpers');

// Helper that maps each vendor URL to the right response shape with the supplied score total.
function fakeAllVendorsWith(perSlotTotal) {
  // perSlotTotal: { 'opus-4.7': 912, 'sonnet-4.6': 874, ... }
  return makeFakeFetch([
    {
      match: u => u.includes('api.anthropic.com'),
      // Anthropic powers slots 1-4. Pick a deterministic total per request by
      // sniffing the model name in the request body.
      body: (_url, opts) => {
        const body = JSON.parse(opts.body);
        const id = anthropicIdFromModel(body.model);
        return anthropicShape(cannedScore({ total: perSlotTotal[id] }));
      },
    },
    {
      match: u => u.includes('generativelanguage.googleapis.com'),
      body: (url) => {
        const m = url.match(/\/models\/([^:]+):/);
        const id = m ? geminiIdFromModel(m[1]) : 'gemini-flash';
        return geminiShape(cannedScore({ total: perSlotTotal[id] }));
      },
    },
    {
      match: u => /api\.openai\.com|api\.x\.ai|api\.deepseek\.com|api\.together\.xyz|api\.mistral\.ai/.test(u),
      body: (url, opts) => {
        const body = JSON.parse(opts.body);
        const id = openaiCompatIdFromUrlAndModel(url, body.model);
        return openaiCompatShape(cannedScore({ total: perSlotTotal[id] }));
      },
    },
  ]);
}

function anthropicIdFromModel(model) {
  return {
    'claude-opus-4-7':   'opus-4.7',
    'claude-sonnet-4-6': 'sonnet-4.6',
    'claude-haiku-4-5':  'haiku-4.5',
    'claude-opus-4-6':   'opus-4.6',
  }[model];
}
function geminiIdFromModel(model) {
  return { 'gemini-2.5-pro': 'gemini-2.5-pro', 'gemini-2.5-flash': 'gemini-flash' }[model];
}
function openaiCompatIdFromUrlAndModel(url, model) {
  if (url.includes('api.openai.com'))   return model === 'gpt-5-mini' ? 'gpt-5-mini' : 'gpt-5.0';
  if (url.includes('api.x.ai'))         return 'grok-4';
  if (url.includes('api.deepseek.com')) return 'deepseek-v3';
  if (url.includes('api.together.xyz')) return 'llama-4-405b';
  if (url.includes('api.mistral.ai'))   return 'mistral-large';
  return 'gpt-5.0';
}

const ALL_PASS = {
  'opus-4.7': 912, 'sonnet-4.6': 874, 'haiku-4.5': 792, 'opus-4.6': 881,
  'gpt-5.0': 853, 'gpt-5-mini': 781, 'gemini-2.5-pro': 823, 'gemini-flash': 762,
  'grok-4': 804, 'llama-4-405b': 811, 'mistral-large': 771, 'deepseek-v3': 788,
};

const ONE_BELOW_FLOOR = { ...ALL_PASS, 'gemini-flash': 712 };

const tests = [
  ['all 12 models pass → backtest passes with mean ≥ 750', async () => {
    const ledger = new Ledger();
    const r = await runBacktest({
      plan: 'plan text',
      tenant: 'acme',
      env: FAKE_ENV,
      ledger,
      fetchImpl: fakeAllVendorsWith(ALL_PASS),
    });
    assertEqual(r.pass, true, 'pass');
    assertEqual(r.summary.models, 12, 'models invoked');
    assert(r.summary.mean >= 750, `mean ${r.summary.mean}`);
    assert(r.summary.weakestDimension !== null, 'weakest dim recorded');
    assertEqual(ledger.usage({ tenant: 'acme' }).calls, 12, 'ledger entries');
  }],
  ['one model below 750 → backtest fails even if mean is high', async () => {
    const ledger = new Ledger();
    const r = await runBacktest({
      plan: 'plan text',
      tenant: 'acme',
      env: FAKE_ENV,
      ledger,
      fetchImpl: fakeAllVendorsWith(ONE_BELOW_FLOOR),
    });
    assertEqual(r.pass, false, 'fail');
    assert(r.summary.min < 750, `min ${r.summary.min}`);
  }],
  ['provider failures are reported and do not crash the run', async () => {
    const ledger = new Ledger();
    const fetchImpl = async (url, opts) => {
      if (url.includes('api.x.ai')) throw new Error('upstream timeout');
      const real = fakeAllVendorsWith(ALL_PASS);
      return real(url, opts);
    };
    const r = await runBacktest({
      plan: 'plan',
      tenant: 'acme',
      env: FAKE_ENV,
      ledger,
      fetchImpl,
    });
    assertEqual(r.summary.failed, 1, 'one failed');
    assertEqual(r.pass, false, 'partial coverage cannot pass');
  }],
];

module.exports = tests;
