#!/usr/bin/env node
'use strict';

const path = require('path');
const lib = require('./index');

const DEFAULT_DIR = process.env.ATLAS_AUDIT_DIR
  || path.resolve(process.cwd(), '.atlas/audit');

function usage() {
  console.log(`atlas-audit — Atlas append-only audit log + compliance kit

  atlas-audit record    --tenant <id> --actor <id> --action <a> --resource <r> --id <rid>
                        [--before <json>] [--after <json>] [--region us|eu|apac] [--ip <ip>]

  atlas-audit query     --tenant <id>
                        [--actor <id>] [--action <a>] [--resource <r>] [--id <rid>]
                        [--region us|eu|apac] [--since <iso>] [--until <iso>]

  atlas-audit export    --tenant <id> --resource <r> --id <rid>

  atlas-audit redact    --tenant <id> --resource <r> --id <rid>
                        [--actor <id>] [--reason "<text>"]

  atlas-audit archive   --tenant <id> --resource <r> --id <rid>
                        [--actor <id>] [--reason "<text>"]

  atlas-audit residency --tenant <id> --region us|eu|apac

Env:
  ATLAS_AUDIT_DIR   directory holding audit segments (default: .atlas/audit)`);
}

function parseArgs(argv) {
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.opts[key] = true;
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

function maybeJson(v) {
  if (v === undefined || v === null || v === true) return null;
  try { return JSON.parse(v); } catch (_) { return v; }
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { opts } = parseArgs(rest);
  const dir = opts.dir || DEFAULT_DIR;

  try {
    switch (cmd) {
      case 'record': {
        const ev = lib.record(dir, {
          tenantId: opts.tenant,
          actorId: opts.actor,
          action: opts.action,
          resource: opts.resource,
          resourceId: opts.id,
          before: maybeJson(opts.before),
          after: maybeJson(opts.after),
          residency: opts.region,
          ip: opts.ip || null,
        });
        console.log(JSON.stringify(ev, null, 2));
        break;
      }
      case 'query': {
        const rows = lib.query(dir, {
          tenantId: opts.tenant,
          actorId: opts.actor,
          action: opts.action,
          resource: opts.resource,
          resourceId: opts.id,
          residency: opts.region,
          since: opts.since,
          until: opts.until,
        });
        console.log(JSON.stringify(rows, null, 2));
        break;
      }
      case 'export': {
        const out = lib.exportResource(dir, {
          tenantId: opts.tenant,
          resource: opts.resource,
          resourceId: opts.id,
        });
        console.log(JSON.stringify(out, null, 2));
        break;
      }
      case 'redact': {
        const ev = lib.redactResource(dir, {
          tenantId: opts.tenant,
          resource: opts.resource,
          resourceId: opts.id,
          actorId: opts.actor || 'system',
          reason: typeof opts.reason === 'string' ? opts.reason : null,
        });
        console.log(JSON.stringify(ev, null, 2));
        break;
      }
      case 'archive': {
        const ev = lib.archive(dir, {
          tenantId: opts.tenant,
          resource: opts.resource,
          resourceId: opts.id,
          actorId: opts.actor || 'system',
          reason: typeof opts.reason === 'string' ? opts.reason : null,
        });
        console.log(JSON.stringify(ev, null, 2));
        break;
      }
      case 'residency': {
        const r = lib.setTenantRegion(dir, opts.tenant, opts.region);
        console.log(JSON.stringify(r, null, 2));
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
