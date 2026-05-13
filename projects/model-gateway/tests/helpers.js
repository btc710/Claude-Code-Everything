'use strict';

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}
function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

// Build a fake fetch that returns the supplied scored JSON for any vendor URL.
// `responseByMatch` is an array of { match: (url) => bool, body: () => object }.
function makeFakeFetch(responseByMatch) {
  return async (url, opts) => {
    for (const r of responseByMatch) {
      if (r.match(url, opts)) {
        const body = typeof r.body === 'function' ? r.body(url, opts) : r.body;
        return {
          ok: r.ok !== false,
          status: r.status || 200,
          async json() { return body; },
          async text() { return JSON.stringify(body); },
        };
      }
    }
    throw new Error(`fakeFetch: no match for ${url}`);
  };
}

// A canned scored response that puts the model above/below the 750 floor.
function cannedScore({ total = 820, weakest = 'observability', concerns = [] } = {}) {
  return {
    model: 'fake',
    total,
    dimensions: {
      scope_completeness: 85,
      feasibility: 82,
      risk_coverage: 78,
      estimate_calibration: 80,
      dependency_clarity: 81,
      success_criteria: 84,
      observability: 75,
      failure_modes: 79,
      reversibility: 82,
      stakeholder_alignment: 84,
    },
    weakest_dimension: weakest,
    specific_concerns: concerns,
  };
}

// Wraps a scored object into the shape each vendor's API returns.
function anthropicShape(scored, usage = { input_tokens: 200, output_tokens: 300 }) {
  return {
    content: [{ type: 'text', text: JSON.stringify(scored) }],
    usage,
  };
}
function openaiCompatShape(scored, usage = { prompt_tokens: 200, completion_tokens: 300 }) {
  return {
    choices: [{ message: { role: 'assistant', content: JSON.stringify(scored) } }],
    usage,
  };
}
function geminiShape(scored, usage = { promptTokenCount: 200, candidatesTokenCount: 300 }) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(scored) }] } }],
    usageMetadata: usage,
  };
}

const FAKE_ENV = {
  ANTHROPIC_API_KEY: 'x',
  OPENAI_API_KEY: 'x',
  GOOGLE_API_KEY: 'x',
  XAI_API_KEY: 'x',
  TOGETHER_API_KEY: 'x',
  MISTRAL_API_KEY: 'x',
  DEEPSEEK_API_KEY: 'x',
  ATLAS_TENANT_TOKENS: 'acme:secret-acme,beta:secret-beta',
};

module.exports = {
  assertEqual, assert, makeFakeFetch, cannedScore,
  anthropicShape, openaiCompatShape, geminiShape, FAKE_ENV,
};
