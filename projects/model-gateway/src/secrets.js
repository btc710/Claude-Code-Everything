'use strict';

// Vendor key resolver. In dev: read from env. In prod: swap this module for a
// vault-backed implementation (AWS Secrets Manager, GCP Secret Manager, etc.)
// without touching call sites.

const ENV_VAR_BY_PROVIDER = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai:    'OPENAI_API_KEY',
  google:    'GOOGLE_API_KEY',
  xai:       'XAI_API_KEY',
  together:  'TOGETHER_API_KEY',
  mistral:   'MISTRAL_API_KEY',
  deepseek:  'DEEPSEEK_API_KEY',
};

function getVendorKey(provider, env = process.env) {
  const envVar = ENV_VAR_BY_PROVIDER[provider];
  if (!envVar) throw new Error(`Unknown provider: ${provider}`);
  const value = env[envVar];
  if (!value) throw new Error(`Missing vendor key ${envVar}`);
  return value;
}

// Tenant tokens. Format: tenantId:secret,tenantId2:secret2
function loadTenantTokens(env = process.env) {
  const raw = env.ATLAS_TENANT_TOKENS || '';
  const out = new Map();
  for (const pair of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const [tenantId, secret] = pair.split(':');
    if (!tenantId || !secret) continue;
    out.set(secret, tenantId);
  }
  return out;
}

module.exports = { getVendorKey, loadTenantTokens };
