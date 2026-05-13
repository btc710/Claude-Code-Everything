'use strict';

// The 12 model slots used by the Atlas backtest gate.
// `model` is the vendor-specific identifier the API expects.
// `priceIn` / `priceOut` are USD per 1M tokens (illustrative; update from each
// vendor's published pricing before going live).
const REGISTRY = [
  { slot: 1,  id: 'opus-4.7',       provider: 'anthropic', model: 'claude-opus-4-7',        priceIn: 15.00, priceOut: 75.00 },
  { slot: 2,  id: 'sonnet-4.6',     provider: 'anthropic', model: 'claude-sonnet-4-6',      priceIn:  3.00, priceOut: 15.00 },
  { slot: 3,  id: 'haiku-4.5',      provider: 'anthropic', model: 'claude-haiku-4-5',       priceIn:  0.80, priceOut:  4.00 },
  { slot: 4,  id: 'opus-4.6',       provider: 'anthropic', model: 'claude-opus-4-6',        priceIn: 15.00, priceOut: 75.00 },
  { slot: 5,  id: 'gpt-5.0',        provider: 'openai',    model: 'gpt-5',                  priceIn:  5.00, priceOut: 20.00 },
  { slot: 6,  id: 'gpt-5-mini',     provider: 'openai',    model: 'gpt-5-mini',             priceIn:  0.50, priceOut:  2.00 },
  { slot: 7,  id: 'gemini-2.5-pro', provider: 'google',    model: 'gemini-2.5-pro',         priceIn:  3.50, priceOut: 10.50 },
  { slot: 8,  id: 'gemini-flash',   provider: 'google',    model: 'gemini-2.5-flash',       priceIn:  0.30, priceOut:  1.20 },
  { slot: 9,  id: 'grok-4',         provider: 'xai',       model: 'grok-4-latest',          priceIn:  5.00, priceOut: 15.00 },
  { slot: 10, id: 'llama-4-405b',   provider: 'together',  model: 'meta-llama/Llama-4-405B-Instruct', priceIn: 3.50, priceOut: 3.50 },
  { slot: 11, id: 'mistral-large',  provider: 'mistral',   model: 'mistral-large-latest',   priceIn:  2.00, priceOut:  6.00 },
  { slot: 12, id: 'deepseek-v3',    provider: 'deepseek',  model: 'deepseek-chat',          priceIn:  0.27, priceOut:  1.10 },
];

const BY_ID = new Map(REGISTRY.map(s => [s.id, s]));
const BY_SLOT = new Map(REGISTRY.map(s => [s.slot, s]));

function listSlots() {
  return REGISTRY.slice();
}

function getSlot(idOrSlotNumber) {
  if (typeof idOrSlotNumber === 'number') return BY_SLOT.get(idOrSlotNumber);
  return BY_ID.get(idOrSlotNumber);
}

module.exports = { REGISTRY, listSlots, getSlot };
