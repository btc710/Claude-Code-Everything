#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const registry = require('./registry');
const connections = require('./connections');

const DEFAULT_FILE =
  process.env.ATLAS_INTEGRATIONS_FILE ||
  path.resolve(process.cwd(), '.atlas/integrations.json');

function usage() {
  return [
    'atlas-integrations — per-tenant adapter registry',
    '',
    'Usage:',
    '  atlas-integrations list-adapters',
    '  atlas-integrations connect    --tenant <id> --adapter <id> [--token <t>] [--refresh-token <r>] [--scopes <a,b>] [--metadata <json>]',
    '  atlas-integrations disconnect --tenant <id> --adapter <id>',
    '  atlas-integrations invoke     --tenant <id> --adapter <id> --op <op> [--args <json>]',
    '',
    'Notes:',
    '  --token may be omitted; the CLI will then read the token from stdin',
    '  --metadata accepts JSON (e.g. \'{"instanceUrl":"https://acme.my.salesforce.com"}\')',
    '',
    'Env:',
    '  ATLAS_INTEGRATIONS_FILE   path to the connection store JSON (default: .atlas/integrations.json)',
  ].join('\n');
}

function parseArgs(argv) {
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        out.opts[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        out.opts[a.slice(2)] = argv[i + 1];
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8').trim();
  } catch (_) {
    return '';
  }
}

function parseJsonArg(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return JSON.parse(value);
  } catch (e) {
    throw new Error(`${label}: invalid JSON (${e.message})`);
  }
}

async function run(argv, env = process.env, io = {}) {
  const log = io.log || console.log;
  const err = io.err || console.error;
  const readStdin = io.readStdin || readStdinSync;

  const [cmd, ...rest] = argv;
  const { opts } = parseArgs(rest);
  const file = opts.file || env.ATLAS_INTEGRATIONS_FILE || DEFAULT_FILE;

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      log(usage());
      return 0;

    case 'list-adapters': {
      const list = registry.listAdapters();
      log(JSON.stringify(list, null, 2));
      return 0;
    }

    case 'connect': {
      if (!opts.tenant) {
        err('connect: --tenant is required');
        return 1;
      }
      if (!opts.adapter) {
        err('connect: --adapter is required');
        return 1;
      }
      const adapter = registry.getAdapter(opts.adapter);
      if (!adapter) {
        err(`connect: unknown adapter "${opts.adapter}"`);
        return 1;
      }
      const token = opts.token || readStdin();
      if (!token) {
        err('connect: --token is required (or pipe via stdin)');
        return 1;
      }
      const scopes = opts.scopes
        ? opts.scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : (adapter.auth.metadata && adapter.auth.metadata.scopes) || [];
      const metadata = parseJsonArg(opts.metadata, '--metadata') || {};
      const row = connections.put(file, {
        tenantId: opts.tenant,
        adapterId: opts.adapter,
        token,
        refreshToken: opts['refresh-token'] || null,
        scopes,
        metadata,
      });
      // Don't print the token back; printing the row would defeat the
      // value of taking it from stdin.
      const redacted = Object.assign({}, row, {
        token: '***',
        refreshToken: row.refreshToken ? '***' : null,
      });
      log(JSON.stringify(redacted, null, 2));
      return 0;
    }

    case 'disconnect': {
      if (!opts.tenant) {
        err('disconnect: --tenant is required');
        return 1;
      }
      if (!opts.adapter) {
        err('disconnect: --adapter is required');
        return 1;
      }
      const ok = connections.remove(file, opts.tenant, opts.adapter);
      log(JSON.stringify({ removed: ok }, null, 2));
      return ok ? 0 : 1;
    }

    case 'invoke': {
      if (!opts.tenant) {
        err('invoke: --tenant is required');
        return 1;
      }
      if (!opts.adapter) {
        err('invoke: --adapter is required');
        return 1;
      }
      if (!opts.op) {
        err('invoke: --op is required');
        return 1;
      }
      const row = connections.get(file, opts.tenant, opts.adapter);
      if (!row) {
        err(`invoke: no connection for tenant=${opts.tenant} adapter=${opts.adapter}`);
        return 1;
      }
      const args = parseJsonArg(opts.args, '--args') || {};
      const ctx = {
        tenantId: opts.tenant,
        connection: connections.toAdapterConnection(row),
      };
      try {
        const result = await registry.invokeAdapter(opts.adapter, opts.op, ctx, args);
        connections.markUsed(file, opts.tenant, opts.adapter);
        log(JSON.stringify(result, null, 2));
        return 0;
      } catch (e) {
        const payload = {
          error: e.name || 'Error',
          message: e.message,
          adapterId: e.adapterId,
          op: e.op,
          status: e.status,
        };
        err(JSON.stringify(payload, null, 2));
        return 1;
      }
    }

    default:
      err(`unknown command: ${cmd}`);
      err(usage());
      return 1;
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code || 0),
    (e) => {
      console.error(e.stack || e.message || e);
      process.exit(1);
    },
  );
}

module.exports = { run, parseArgs, usage };
