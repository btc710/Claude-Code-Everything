'use strict';

const { getSlot } = require('./registry');
const { getVendorKey } = require('./secrets');
const { callAnthropic } = require('./providers/anthropic');
const { callOpenAICompat } = require('./providers/openai-compat');
const { callGemini } = require('./providers/google');

const SYSTEM_PROMPT = `You score project plans on the Atlas rubric. Be ruthless on weak dimensions.
The pass floor is 750 — anything you would score below 750 must name its weakest dimension in specific_concerns.

Return ONLY a JSON object matching this shape:
{
  "model": "<slot id>",
  "total": <0-1000>,
  "dimensions": {
    "scope_completeness": 0-100,
    "feasibility": 0-100,
    "risk_coverage": 0-100,
    "estimate_calibration": 0-100,
    "dependency_clarity": 0-100,
    "success_criteria": 0-100,
    "observability": 0-100,
    "failure_modes": 0-100,
    "reversibility": 0-100,
    "stakeholder_alignment": 0-100
  },
  "weakest_dimension": "<dimension name>",
  "specific_concerns": ["...", "..."]
}`;

function buildUserPrompt(plan) {
  return `PLAN TO SCORE:\n\n${plan}\n\nReturn JSON now.`;
}

function safeParseJson(text) {
  // Tolerant of code fences and prose; finds the first {...} block.
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('no JSON object in model response');
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function scoreWithSlot({ slotIdOrNumber, plan, env = process.env, fetchImpl = fetch }) {
  const slot = getSlot(slotIdOrNumber);
  if (!slot) throw new Error(`unknown slot ${slotIdOrNumber}`);
  const apiKey = getVendorKey(slot.provider, env);
  const userPrompt = buildUserPrompt(plan);

  let result;
  if (slot.provider === 'anthropic') {
    result = await callAnthropic({
      apiKey, model: slot.model, system: SYSTEM_PROMPT, prompt: userPrompt, fetchImpl,
    });
  } else if (slot.provider === 'google') {
    result = await callGemini({
      apiKey, model: slot.model, system: SYSTEM_PROMPT, prompt: userPrompt, fetchImpl,
    });
  } else {
    result = await callOpenAICompat({
      provider: slot.provider, apiKey, model: slot.model,
      system: SYSTEM_PROMPT, prompt: userPrompt, fetchImpl,
    });
  }

  const parsed = safeParseJson(result.text);
  return {
    slot: slot.id,
    model: slot.model,
    provider: slot.provider,
    score: parsed,
    usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
  };
}

module.exports = { scoreWithSlot, SYSTEM_PROMPT, safeParseJson };
