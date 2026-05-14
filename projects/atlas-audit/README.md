# atlas-audit

Append-only audit log + compliance kit for the Atlas stack. Provides the SOC2-style
controls every B2B SaaS reaches for around year two: immutable events with monthly
WORM-shaped segments, data-residency tagging, redaction-by-tombstone for GDPR/CCPA
data-subject requests, soft-delete archive, and a per-resource history export API.

Sketch #8 in the productization plan. JSON-file backed today; production swaps
`src/segments.js` for object storage with WORM / object-lock (S3 Object Lock, GCS
bucket lock) without touching call sites.

## Why

- **Immutability is a control, not a feature.** Every domain mutation in Atlas
  lands here as one row. `record()` refuses to overwrite an existing id, and the
  segment writer never reopens a finished month — the same property auditors look
  for in a WORM bucket.
- **Erasure without rewriting history.** GDPR Article 17 / CCPA deletion are
  honored by writing a `redact` tombstone. Queries scrub the payload of every
  prior row for that resource; the underlying log still has it so compliance can
  prove an event occurred. The redact event itself is left intact so auditors
  see when erasure happened and who did it.
- **Residency is per-row.** Every event carries a region (`us | eu | apac`).
  Defaults are tenant-scoped, but a single high-sensitivity event can override.
  Queries filter by region so an EU regulator sees only EU rows.
- **Tenant isolation is mandatory.** `query()` throws if `tenantId` is omitted —
  there is no "scan everything" path for a customer-facing caller.

## Data shape

Each event is one JSON line in `audit-YYYY-MM.jsonl`:

```js
{
  id, ts, tenantId, actorId, action, resource, resourceId,
  before, after, residency,            // 'us' | 'eu' | 'apac'
  ip, meta                             // meta.kind = 'redact' | 'archive' | 'unarchive'
}
```

`action` is application-defined (`create`, `update`, `login`, `share`, …); the
`redact` / `archive` / `unarchive` actions are reserved tombstones the library
itself writes.

## Library use

```js
const audit = require('atlas-audit');
const dir = '.atlas/audit';

// One-time tenant residency default
audit.setTenantRegion(dir, 'acme-eu', 'eu');

// Every mutation in your app
audit.record(dir, {
  tenantId: 'acme-eu',
  actorId:  'u_123',
  action:   'update',
  resource: 'projects',
  resourceId: 'p_42',
  before:   { name: 'Old' },
  after:    { name: 'New' },
  ip:       '203.0.113.7',
});

// GDPR data-subject access request — full history for one resource
const dossier = audit.exportResource(dir, {
  tenantId: 'acme-eu', resource: 'projects', resourceId: 'p_42',
});

// Right to erasure — tombstone every prior payload for that resource
audit.redactResource(dir, {
  tenantId: 'acme-eu', resource: 'projects', resourceId: 'p_42',
  actorId: 'dpo_1', reason: 'GDPR Article 17 request',
});

// Soft delete / "archive don't delete"
audit.archive(dir, {
  tenantId: 'acme-eu', resource: 'projects', resourceId: 'p_42',
  actorId: 'admin_9', reason: 'shipped',
});
audit.isArchived(dir, 'acme-eu', 'projects', 'p_42');  // → true

// Investigations
audit.query(dir, { tenantId: 'acme-eu', actorId: 'u_123', since: '2026-01-01' });
audit.query(dir, { tenantId: 'acme-eu', residency: 'eu' });
```

## CLI

```bash
node src/cli.js record   --tenant acme --actor u_1 --action create \
                         --resource projects --id p_1 \
                         --after '{"name":"P"}' --region eu

node src/cli.js query    --tenant acme --resource projects
node src/cli.js export   --tenant acme --resource projects --id p_1
node src/cli.js redact   --tenant acme --resource projects --id p_1 \
                         --actor dpo_1 --reason "GDPR Article 17"
node src/cli.js archive  --tenant acme --resource projects --id p_1 --actor admin_1
node src/cli.js residency --tenant acme --region eu
```

Default segment dir: `.atlas/audit/` in the current working directory. Override
with `ATLAS_AUDIT_DIR=/path/to/dir`.

## Test

```bash
node tests/run-all.js
```

## How it fits with the other Atlas pieces

```
atlas-tenants ──┐
                ├──▶ atlas-audit
atlas-ledger ───┤      record every status change
atlas-knowledge-graph ─┘
                       query() for investigations
                       exportResource() for DSARs
                       redactResource() for erasure
                       isArchived() so the rest of the stack
                       knows what to hide from the UI
```

Atlas-tenants writes per-tenant defaults via `setTenantRegion()`. Atlas-ledger
records every project status change as one event. Any service can call
`redactResource()` from a DPO console without rewriting prior rows.

## SOC2 trust criteria addressed by this scaffolding

**Addresses:**

- **CC6.1 / CC7.2 — Logical access & system monitoring.** Every domain mutation
  records `actorId`, `ts`, `ip`, and a before/after diff. `query()` exposes the
  trail for investigations.
- **CC6.5 — Restricted modification.** `record()` rejects duplicate ids and the
  segment writer never reopens a finished month, so events cannot be silently
  edited or backdated into an existing row.
- **CC7.3 — System operations / change tracking.** Status transitions are
  observable as a stream of `before`/`after` pairs.
- **CC8.1 — Change management evidence.** Append-only segments are the evidence
  artifact a SOC2 auditor expects to sample.
- **P4.2 / P5.1 (Privacy) and GDPR Art. 17 / CCPA §1798.105 — Right to erasure.**
  `redactResource()` is a control surface for honoring data-subject deletion
  without breaking the immutability story; `exportResource()` is the DSAR API
  for portability and access (Art. 15 / 20).
- **C1.1 — Confidentiality / data residency.** Per-row region tag plus per-tenant
  defaults give you the legal-home guarantee EU and APAC customers ask for.

**Does NOT address (you still need other controls for these):**

- **CC6.6 / CC6.7 — Encryption at rest and in transit.** The JSON sketch writes
  cleartext to local disk; production must wrap segments with KMS-managed
  encryption and tenant-scoped keys.
- **CC6.8 — Cryptographic key management.** No key rotation, no envelope
  encryption.
- **A1.2 — Availability / backups & DR.** No replication, no offsite copies, no
  RPO/RTO controls.
- **CC4.1 — Continuous monitoring & alerting.** No SIEM integration, no
  anomaly detection, no real-time alerts when a high-value event lands.
- **CC2.1 — Authoritative time source.** `ts` defaults to host wall-clock; a
  real deployment needs synced NTP and ideally a signed/notarized timestamp.
- **CC7.1 — Vulnerability management.** Out of scope.
- **Tamper evidence.** Append-only on a single host is honor-system. Production
  needs object-lock (S3/GCS), hash-chained segments, or a transparency log so a
  privileged operator cannot rewrite a segment file without leaving a trace.
- **Segregation of duties.** Anyone with filesystem write access can append
  events for any tenant. Production must gate `record()` behind an authenticated
  RPC that enforces actor identity.

## Production hardening (not in this sketch)

- Replace `src/segments.js` with S3 Object Lock (or GCS bucket lock).
- Hash-chain each segment (every line carries the SHA-256 of the previous line)
  so a tampered file fails verification.
- Move the residency sidecar into the tenants service; ship per-region segments
  to per-region buckets so data physically stays put.
- Run `record()` behind an authenticated RPC with row-level authorization.
- Stream every event to a SIEM (Datadog, Panther, Splunk) for monitoring &
  alerting.
- Backup segments to a cold WORM bucket on a daily cadence; verify chain.
- Add a Merkle root publishable to an external transparency log for
  third-party-verifiable immutability.
