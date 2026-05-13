#!/usr/bin/env node
'use strict';

const path = require('path');
const lib = require('./index');
const { resolveSink } = require('./sinks');
const stateMod = require('./state');

const DEFAULT_FILE = process.env.ATLAS_LEDGER_FILE
  || path.resolve(process.cwd(), '.atlas/ledger.json');

function usage() {
  console.log(`atlas-notifier — Atlas notification worker

  atlas-notifier scan      --ledger <file> [--window <days>]
  atlas-notifier dispatch  --ledger <file> --sink <slack|email|webhook> --channel <id> [--window <days>]
  atlas-notifier status    --ledger <file>

Env:
  ATLAS_LEDGER_FILE   path to the ledger JSON store
  SLACK_BOT_TOKEN     auth for the slack sink
  RESEND_API_KEY      auth for the email sink`);
}

function parseArgs(argv) {
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out.opts[a.slice(2)] = argv[i + 1]; i++; }
    else out._.push(a);
  }
  return out;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const { opts } = parseArgs(rest);
  const file = opts.ledger || DEFAULT_FILE;
  const windowDays = parseInt(opts.window || '7', 10);

  try {
    switch (cmd) {
      case 'scan': {
        const followups = lib.scanStaleFollowups(file);
        const reviews = lib.scanDueReviews(file, windowDays);
        const merged = lib.mergeBatches(followups, reviews);
        // Strip the projects Map from output (not JSON-serializable cleanly).
        const printable = merged.map(b => ({
          tenant: b.tenant,
          owner: b.owner,
          followups: b.followups,
          reviews: b.reviews,
        }));
        console.log(JSON.stringify(printable, null, 2));
        break;
      }
      case 'dispatch': {
        if (!opts.sink) throw new Error('--sink required');
        if (!opts.channel) throw new Error('--channel required');
        const sink = resolveSink(opts.sink);
        const followups = lib.scanStaleFollowups(file);
        const reviews = lib.scanDueReviews(file, windowDays);
        const merged = lib.mergeBatches(followups, reviews);
        const stateFile = stateMod.defaultStateFile(file);
        const results = [];
        for (const batch of merged) {
          const r = await lib.dispatch(sink, batch, {
            channel: opts.channel,
            stateFile,
            sinkName: opts.sink,
          });
          results.push({ tenant: batch.tenant, owner: batch.owner, ...r });
        }
        console.log(JSON.stringify(results, null, 2));
        break;
      }
      case 'status': {
        const stateFile = stateMod.defaultStateFile(file);
        const s = stateMod.load(stateFile);
        const keys = Object.keys(s.notified);
        console.log(JSON.stringify({
          stateFile,
          totalNotified: keys.length,
          mostRecent: keys.slice(-5),
        }, null, 2));
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
