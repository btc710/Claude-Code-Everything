#!/usr/bin/env node
'use strict';

const path = require('path');
const lib = require('./index');

const DEFAULT_FILE = process.env.ATLAS_TENANTS_FILE || path.resolve(process.cwd(), '.atlas/tenants.json');

function usage() {
  console.log(`atlas-tenants — Atlas tenant + RBAC service

  atlas-tenants create-tenant  --name <text> [--owner-email <email>]
  atlas-tenants list-tenants
  atlas-tenants invite         --tenant <id> --email <email> [--role <r>] [--name <text>]
  atlas-tenants list-members   --tenant <id>
  atlas-tenants set-role       --tenant <id> --user <id> --role <r>
  atlas-tenants remove-member  --tenant <id> --user <id>
  atlas-tenants issue-token    --tenant <id> --user <id> [--scopes "a,b,c"] [--ttl-days <n>]
  atlas-tenants list-tokens    [--tenant <id>] [--user <id>] [--include-revoked]
  atlas-tenants revoke         --token-id <id>
  atlas-tenants whoami         --token <plaintext> [--scopes "a,b"]
  atlas-tenants audit          [--tenant <id>] [--action <a>] [--limit <n>]

Env:
  ATLAS_TENANTS_FILE   path to the JSON store (default: .atlas/tenants.json)`);
}

function parseArgs(argv) {
  const out = { _: [], opts: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.flags.add(key);
      } else {
        out.opts[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function parseList(v) {
  if (!v) return [];
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { opts, flags } = parseArgs(rest);
  const file = opts.file || DEFAULT_FILE;
  try {
    switch (cmd) {
      case 'create-tenant': {
        let ownerUserId = null;
        if (opts['owner-email']) {
          const u = lib.upsertUser(file, { email: opts['owner-email'], displayName: opts['owner-name'] || null });
          ownerUserId = u.id;
        }
        const t = lib.createTenant(file, { name: opts.name, ownerUserId });
        console.log(JSON.stringify(t, null, 2));
        break;
      }
      case 'list-tenants': {
        console.log(JSON.stringify(lib.listTenants(file), null, 2));
        break;
      }
      case 'invite': {
        const m = lib.inviteUser(file, {
          tenantId: opts.tenant,
          email: opts.email,
          role: opts.role || 'member',
          displayName: opts.name || null,
        });
        console.log(JSON.stringify(m, null, 2));
        break;
      }
      case 'list-members': {
        console.log(JSON.stringify(lib.listMembers(file, opts.tenant), null, 2));
        break;
      }
      case 'set-role': {
        const m = lib.setRole(file, { tenantId: opts.tenant, userId: opts.user, role: opts.role });
        console.log(JSON.stringify(m, null, 2));
        break;
      }
      case 'remove-member': {
        const m = lib.removeMember(file, { tenantId: opts.tenant, userId: opts.user });
        console.log(JSON.stringify(m, null, 2));
        break;
      }
      case 'issue-token': {
        const ttlDays = opts['ttl-days'] ? parseInt(opts['ttl-days'], 10) : null;
        const ttlMs = ttlDays === null ? undefined : ttlDays * 24 * 60 * 60 * 1000;
        const { token, record } = lib.issueToken(file, {
          tenantId: opts.tenant,
          userId: opts.user,
          scopes: parseList(opts.scopes),
          ttlMs,
        });
        // Print the plaintext exactly once. Strip the hash from the record so we
        // never echo it to a terminal or pipe.
        const { hash, ...rest } = record;
        console.log(JSON.stringify({ token, record: rest }, null, 2));
        break;
      }
      case 'list-tokens': {
        const list = lib.listTokens(file, {
          tenantId: opts.tenant || null,
          userId: opts.user || null,
          includeRevoked: flags.has('include-revoked'),
        });
        console.log(JSON.stringify(list, null, 2));
        break;
      }
      case 'revoke': {
        const t = opts['token-id']
          ? lib.revokeToken(file, opts['token-id'])
          : lib.revokeTokenByPlaintext(file, opts.token);
        const { hash, ...rest } = t;
        console.log(JSON.stringify(rest, null, 2));
        break;
      }
      case 'whoami': {
        const required = parseList(opts.scopes);
        const principal = lib.authorize(file, opts.token, required);
        console.log(JSON.stringify(principal, null, 2));
        break;
      }
      case 'audit': {
        const list = lib.listAudit(file, {
          tenantId: opts.tenant || null,
          action: opts.action || null,
          limit: opts.limit ? parseInt(opts.limit, 10) : null,
        });
        console.log(JSON.stringify(list, null, 2));
        break;
      }
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        usage();
        break;
      default:
        usage();
        process.exitCode = 1;
    }
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { main };
