'use strict';

// Fake fetch for the 12 model-gateway providers. Returns the all-pass
// canned scores from projects/model-gateway/tests/backtest.test.js so a
// full backtest run resolves to pass=true.
//
// The vendor response shapes are reproduced here verbatim (anthropic,
// openai-compat, gemini) so this harness does not depend on the
// model-gateway's internal test helpers.

const ALL_PASS = {
  'opus-4.7':       912,
  'sonnet-4.6':     874,
  'haiku-4.5':      792,
  'opus-4.6':       881,
  'gpt-5.0':        853,
  'gpt-5-mini':     781,
  'gemini-2.5-pro': 823,
  'gemini-flash':   762,
  'grok-4':         804,
  'llama-4-405b':   811,
  'mistral-large':  771,
  'deepseek-v3':    788,
};

const FAKE_ENV = {
  ANTHROPIC_API_KEY: 'x',
  OPENAI_API_KEY:    'x',
  GOOGLE_API_KEY:    'x',
  XAI_API_KEY:       'x',
  TOGETHER_API_KEY:  'x',
  MISTRAL_API_KEY:   'x',
  DEEPSEEK_API_KEY:  'x',
  ATLAS_TENANT_TOKENS: 'acme:secret-acme,demo:secret-demo',
};

function cannedScore(total) {
  return {
    model: 'fake',
    total,
    dimensions: {
      scope_completeness:    85,
      feasibility:           82,
      risk_coverage:         78,
      estimate_calibration:  80,
      dependency_clarity:    81,
      success_criteria:      84,
      observability:         75,
      failure_modes:         79,
      reversibility:         82,
      stakeholder_alignment: 84,
    },
    weakest_dimension: 'observability',
    specific_concerns: [],
  };
}

function anthropicShape(scored, usage) {
  return {
    content: [{ type: 'text', text: JSON.stringify(scored) }],
    usage:   usage || { input_tokens: 200, output_tokens: 300 },
  };
}
function openaiCompatShape(scored, usage) {
  return {
    choices: [{ message: { role: 'assistant', content: JSON.stringify(scored) } }],
    usage:   usage || { prompt_tokens: 200, completion_tokens: 300 },
  };
}
function geminiShape(scored, usage) {
  return {
    candidates:    [{ content: { parts: [{ text: JSON.stringify(scored) }] } }],
    usageMetadata: usage || { promptTokenCount: 200, candidatesTokenCount: 300 },
  };
}

// Map vendor model identifiers back to the slot.id used in cannedScore.
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

function ok(body) {
  return {
    ok: true,
    status: 200,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

// Build a fake-fetch that returns all-pass canned scores for every vendor.
function makeAllPassFetch(perSlotTotal = ALL_PASS) {
  return async function fakeFetch(url, opts) {
    if (url.includes('api.anthropic.com')) {
      const body = JSON.parse(opts.body);
      const id = anthropicIdFromModel(body.model);
      return ok(anthropicShape(cannedScore(perSlotTotal[id])));
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      const m = url.match(/\/models\/([^:]+):/);
      const id = m ? geminiIdFromModel(m[1]) : 'gemini-flash';
      return ok(geminiShape(cannedScore(perSlotTotal[id])));
    }
    if (/api\.openai\.com|api\.x\.ai|api\.deepseek\.com|api\.together\.xyz|api\.mistral\.ai/.test(url)) {
      const body = JSON.parse(opts.body);
      const id = openaiCompatIdFromUrlAndModel(url, body.model);
      return ok(openaiCompatShape(cannedScore(perSlotTotal[id])));
    }
    throw new Error(`fakeFetch: no match for ${url}`);
  };
}

module.exports = {
  ALL_PASS,
  FAKE_ENV,
  cannedScore,
  anthropicShape,
  openaiCompatShape,
  geminiShape,
  makeAllPassFetch,
};
