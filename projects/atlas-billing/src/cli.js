#!/usr/bin/env node
'use strict';

const path = require('path');
const lib = require('./index');

const DEFAULT_FILE = process.env.ATLAS_BILLING_FILE || path.resolve(process.cwd(), '.atlas/billing.json');

function usage() {
  console.log(`atlas-billing — usage rollups + invoicing for the Atlas stack

  atlas-billing ingest  --from <gateway-export.json> [--file <store>]
  atlas-billing rollup  --tenant <id> [--month YYYY-MM | --from <ts/iso> --to <ts/iso>]
                        [--by period|slot|project] [--granularity day|month] [--project <id>]
  atlas-billing invoice --tenant <id> --month YYYY-MM
  atlas-billing pricing --tenant <id> [--margin <n>] [--currency <code>] [--net <days>]

Env:
  ATLAS_BILLING_FILE   path to the JSON store (default: .atlas/billing.json)`);
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
    } else out._.push(a);
  }
  return out;
}

function monthToRange(month) {
  const { from, to } = require('./invoice').monthBounds(month);
  return { from, to };
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { opts } = parseArgs(rest);
  const file = opts.file || DEFAULT_FILE;
  try {
    switch (cmd) {
      case 'ingest': {
        if (!opts.from) throw new Error('ingest: --from <gateway-export.json> is required');
        const res = lib.ingestFromFile(file, opts.from);
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      case 'rollup': {
        if (!opts.tenant) throw new Error('rollup: --tenant <id> is required');
        let from = opts.from, to = opts.to;
        if (opts.month) ({ from, to } = monthToRange(opts.month));
        const by = opts.by || 'period';
        let res;
        if (by === 'period') {
          res = lib.byPeriod(file, {
            tenant: opts.tenant,
            from, to,
            granularity: opts.granularity || (opts.month ? 'day' : 'day'),
          });
        } else if (by === 'slot') {
          res = lib.bySlot(file, { tenant: opts.tenant, from, to });
        } else if (by === 'project') {
          res = lib.byProject(file, { tenant: opts.tenant, from, to, project: opts.project || null });
        } else {
          throw new Error(`rollup: --by must be one of period|slot|project (got ${by})`);
        }
        console.log(JSON.stringify(res, null, 2));
        break;
      }
      case 'invoice': {
        if (!opts.tenant) throw new Error('invoice: --tenant <id> is required');
        if (!opts.month) throw new Error('invoice: --month YYYY-MM is required');
        const inv = lib.generateInvoice(file, { tenant: opts.tenant, period: opts.month });
        console.log(JSON.stringify(inv, null, 2));
        break;
      }
      case 'pricing': {
        if (!opts.tenant) throw new Error('pricing: --tenant <id> is required');
        const patch = {};
        if (opts.margin)   patch.margin_multiplier = parseFloat(opts.margin);
        if (opts.currency) patch.currency = opts.currency;
        if (opts.net)      patch.net_terms_days = parseInt(opts.net, 10);
        const cfg = Object.keys(patch).length
          ? lib.setTenantPricing(file, opts.tenant, patch)
          : lib.pricing.tenantConfig(lib.store.load(file), opts.tenant);
        console.log(JSON.stringify(cfg, null, 2));
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
module.exports = { main, parseArgs };
