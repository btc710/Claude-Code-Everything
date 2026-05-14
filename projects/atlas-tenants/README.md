# atlas-tenants

Tenant + RBAC service for the Atlas stack. Multi-tenant identity, role-based authorization, hashed bearer tokens, and an append-only audit trail.

Sketch #1 in the Atlas productization plan and the missing piece behind both `atlas-model-gateway` (currently uses a static env map for tenant tokens) and `atlas-project-ledger` (every row carries a `tenant` string with nothing enforcing where it came from). JSON-file backed today; production swaps `src/store.js` for Postgres without touching call sites.

## Why

- **One identity surface.** Tenants, users, memberships, and tokens live in one place. Every other Atlas service reads `authorize(token)` and gets a `{ tenantId, userId, role }` triple it can trust.
- **Roles that mean something.** `owner | admin | member | viewer` with an explicit permission matrix in `src/permissions.js`. Viewers cannot administer, members cannot issue tokens, only owners get `*`.
- **Hashed tokens.** We return plaintext exactly once. The store keeps a SHA-256 hash, so a stolen JSON file (or DB dump) cannot be replayed.
- **Audit by default.** Every mutation appends a row to `audit`. Reads never write. That's a real compliance story without bolting one on later.

## Data shape

```
{
  version: 1,
  tenants:     [{ id, name, slug, createdAt, updatedAt }],
  users:       [{ id, email, displayName, createdAt }],
  memberships: [{ id, tenantId, userId, role, createdAt, updatedAt }],
  tokens:      [{ id, hash, userId, tenantId, scopes, createdAt, expiresAt, revokedAt }],
  audit:       [{ id, at, actor, tenantId, action, target, meta }]
}
```

Roles: `owner | admin | member | viewer`. See `src/permissions.js` for the full scope matrix.

Token plaintext: `atk_` prefix + 24 random bytes hex. **Never stored.** Only `sha256(plaintext)` is persisted.

## Library use

```js
const lib = require('atlas-tenants');
const file = '.atlas/tenants.json';

// 1. Bootstrap a tenant with a founding owner.
const founder = lib.upsertUser(file, { email: 'blake@acme.test', displayName: 'Blake' });
const tenant  = lib.createTenant(file, { name: 'Acme Co', ownerUserId: founder.id });

// 2. Invite more members under specific roles.
lib.inviteUser(file, { tenantId: tenant.id, email: 'eng@acme.test',     role: 'member' });
lib.inviteUser(file, { tenantId: tenant.id, email: 'finance@acme.test', role: 'viewer' });

// 3. Issue a bearer token. The plaintext is returned exactly once.
const { token, record } = lib.issueToken(file, {
  tenantId: tenant.id,
  userId: founder.id,
  scopes: ['project.read', 'project.write', 'backtest.write'],
  ttlMs: 30 * 24 * 60 * 60 * 1000,
});
// → hand `token` to the caller. `record` (sans hash) is what you log.

// 4. On every inbound request, resolve the token.
try {
  const principal = lib.authorize(file, token, ['backtest.write']);
  // principal = { tokenId, tenantId, userId, role, scopes }
  // throws on: invalid_token | token_revoked | token_expired
  //            membership_missing | role_denied | scope_denied
} catch (e) {
  // map e.message to a 401/403
}

// 5. Revoke when something looks wrong.
lib.revokeTokenByPlaintext(file, token);

// 6. Compliance read.
lib.listAudit(file, { tenantId: tenant.id, action: 'token.issue' });
```

## CLI

```bash
node src/cli.js create-tenant  --name "Acme Co" --owner-email blake@acme.test
node src/cli.js invite         --tenant <ten_…> --email eng@acme.test --role member
node src/cli.js list-members   --tenant <ten_…>
node src/cli.js set-role       --tenant <ten_…> --user <usr_…> --role admin

node src/cli.js issue-token    --tenant <ten_…> --user <usr_…> --scopes "project.read,project.write" --ttl-days 30
# → prints { token: "atk_…", record: { … } } once. Save the token.

node src/cli.js whoami         --token atk_… --scopes "project.write"
node src/cli.js revoke         --token-id <tok_…>

node src/cli.js audit          --tenant <ten_…> --limit 20
```

Default store: `.atlas/tenants.json` in the current working directory. Override with `ATLAS_TENANTS_FILE=/path/to/file`.

## Test

```bash
node tests/run-all.js
# → 48 passed, 0 failed (6 files)
```

The tests use in-process temp files (no fake-fetch needed — there are no external calls). They cover tenant CRUD, role-based authorization (viewer can't administer, member can't issue tokens), token expiry, revocation, scope checking (token scopes intersected with role scopes), and an audit-trail assertion that every mutation writes exactly one row and no read path does.

## How it plugs into the other Atlas pieces

### 1. Replace the model-gateway's tenant resolver

`atlas-model-gateway/src/auth.js` currently does:

```js
const tokens = loadTenantTokens(env);   // env-backed Map<plaintext, tenantId>
return tokens.get(token) || null;
```

Replace it with a single call to `authorize`:

```js
// projects/model-gateway/src/auth.js (after the migration)
const tenants = require('atlas-tenants');
const FILE = process.env.ATLAS_TENANTS_FILE;

function authenticate(req) {
  const header = req.headers && req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  try {
    const p = tenants.authorize(FILE, token, []);
    return p.tenantId;                  // gateway's existing call sites already use this
  } catch {
    return null;
  }
}
```

Gateway endpoints can now require specific scopes — `/v1/backtest` should require `backtest.write`, `/v1/usage` should require `usage.read`, etc. Plug those scopes into the `authorize` call at each route and the gateway gets fine-grained authz for free.

### 2. Tenant-scope every project-ledger row

`atlas-project-ledger` already stores a `tenant` string on every project. With atlas-tenants live, that string is no longer a freeform field — it is `tenant.id` from this service, and the ledger's HTTP front-end (when there is one) should call `authorize(token)` first and use the returned `tenantId` rather than trusting the body. Every query already filters by `tenant`, so row-level isolation comes for free; pair it with the audit log here and you have the "who changed what, when, for which tenant" story that compliance asks about.

In code:

```js
const { tenantId, userId } = tenants.authorize(FILE, req.headers.authorization.slice(7), ['project.write']);
const p = ledger.createProject(LEDGER_FILE, { tenant: tenantId, name: req.body.name });
// optional: tenants.listAudit() now reflects the createProject through any wrapper that emits
//           tenants-side audit rows for cross-service actions.
```

## Design decisions

- **Hash algorithm: SHA-256.** Tokens are 24 random bytes (≥192 bits of entropy), so we don't need a slow KDF — preimage attack surface is zero. SHA-256 also keeps lookup O(1) when we shift to a real DB (`SELECT … WHERE hash = $1`).
- **Plaintext returned once.** `issueToken` returns `{ token, record }`. The caller stores the record id for revocation; the token itself is never reachable from the store afterwards.
- **Permissions live in a matrix, not in code paths.** `src/permissions.js` is the single source for "what can this role do?". `authorize()` consults it; no scope check is hand-coded elsewhere.
- **Scopes are AND'd both ways.** A token can be issued with `scopes: ['project.read']` and the role of the underlying membership still gates. `effectiveScopes(role, tokenScopes)` returns the intersection — the most-restrictive of the two wins.
- **Last-owner protection.** `setRole` and `removeMember` both refuse to leave a tenant with zero owners. Tested.
- **Audit by passing actor.** Mutators take an optional `actor: { userId?, tokenId? }`. The gateway should pass the principal it just authorized. Reads never write audit rows; tested.

## Production hardening (not in this sketch)

- Swap `src/store.js` for Postgres. One table per collection. Row-level security policies on `tenant_id` so a misbehaving query physically cannot see another tenant's rows.
- Move `tokens` to a dedicated table with a unique index on `hash`. Add a `last_used_at` so unused tokens can be auto-revoked.
- Replace SHA-256 with `crypto.timingSafeEqual` at the comparison site (negligible in the JSON sketch; matters when DB queries return a row).
- Refresh-token flow + short-lived bearers (current bearers are long-lived).
- Webhooks on `member.invite` (email the invitee) and `token.revoke` (notify the user).
- Background job that prunes audit rows older than the retention window.
