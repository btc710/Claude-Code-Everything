'use strict';

const fs = require('fs');
const path = require('path');

// Data residency tagging. Every audit event carries a region: us|eu|apac.
// The region is the *legal home* of the row — queries can filter by it,
// and a production store would shard segments into per-region buckets so
// they never cross a sovereign boundary.

const REGIONS = Object.freeze(['us', 'eu', 'apac']);

function isValidRegion(r) {
  return typeof r === 'string' && REGIONS.includes(r);
}

function assertRegion(r) {
  if (!isValidRegion(r)) {
    throw new Error(`invalid residency region: ${r} (allowed: ${REGIONS.join(', ')})`);
  }
}

// Tenant -> default region map lives alongside the segments as a small
// JSON sidecar. Kept separate from the event log so editing it never
// rewrites an append-only segment.
function defaultsFile(dir) {
  return path.join(dir, 'residency.json');
}

function loadDefaults(dir) {
  const file = defaultsFile(dir);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    throw new Error(`residency defaults load failed: ${e.message}`);
  }
}

function saveDefaults(dir, map) {
  fs.mkdirSync(dir, { recursive: true });
  const file = defaultsFile(dir);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2));
  fs.renameSync(tmp, file);
}

function setTenantRegion(dir, tenantId, region) {
  if (!tenantId) throw new Error('setTenantRegion: tenantId required');
  assertRegion(region);
  const map = loadDefaults(dir);
  map[tenantId] = region;
  saveDefaults(dir, map);
  return { tenantId, region };
}

function getTenantRegion(dir, tenantId) {
  const map = loadDefaults(dir);
  return map[tenantId] || null;
}

// Resolve the region to stamp on an event. Per-event override wins; otherwise
// the tenant default; otherwise 'us'. The fallback is deliberate — every
// row in a SOC2-shaped log must have a region, never null.
function resolveRegion(dir, tenantId, override) {
  if (override !== undefined && override !== null) {
    assertRegion(override);
    return override;
  }
  const def = getTenantRegion(dir, tenantId);
  if (def) return def;
  return 'us';
}

module.exports = {
  REGIONS,
  isValidRegion,
  assertRegion,
  loadDefaults,
  saveDefaults,
  setTenantRegion,
  getTenantRegion,
  resolveRegion,
};
