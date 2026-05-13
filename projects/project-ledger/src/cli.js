#!/usr/bin/env node
'use strict';

const path = require('path');
const lib = require('./index');

const DEFAULT_FILE = process.env.ATLAS_LEDGER_FILE || path.resolve(process.cwd(), '.atlas/ledger.json');

function usage() {
  console.log(`atlas-ledger — Atlas project ledger

  atlas-ledger create   --tenant <id> --name <text>
  atlas-ledger list     [--tenant <id>] [--status <status>]
  atlas-ledger show     <projectId>
  atlas-ledger followup --project <id> --topic "<text>" [--owner <name>] [--days <n>]
  atlas-ledger resolve  --followup <id> --with "<text>"
  atlas-ledger schedule-reviews --project <id>
  atlas-ledger due-reviews [--days <n>]
  atlas-ledger stale-followups

Env:
  ATLAS_LEDGER_FILE   path to the JSON store (default: .atlas/ledger.json)`);
}

function parseArgs(argv) {
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      out.opts[a.slice(2)] = argv[i + 1];
      i++;
    } else out._.push(a);
  }
  return out;
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { _: pos, opts } = parseArgs(rest);
  const file = opts.file || DEFAULT_FILE;
  try {
    switch (cmd) {
      case 'create': {
        const p = lib.createProject(file, { tenant: opts.tenant, name: opts.name });
        console.log(JSON.stringify(p, null, 2));
        break;
      }
      case 'list': {
        const list = lib.listProjects(file, { tenant: opts.tenant, status: opts.status });
        console.log(JSON.stringify(list, null, 2));
        break;
      }
      case 'show': {
        const id = pos[0];
        const p = lib.getProject(file, id);
        if (!p) { process.exitCode = 1; console.error('not found'); return; }
        console.log(JSON.stringify({
          project: p,
          backtests: lib.listBacktests(file, id),
          followups: lib.listFollowups(file, { projectId: id }),
          reviews:   lib.listReviews(file, { projectId: id }),
        }, null, 2));
        break;
      }
      case 'followup': {
        const f = lib.openFollowup(file, {
          projectId: opts.project,
          topic: opts.topic,
          owner: opts.owner || null,
          unblockInDays: parseInt(opts.days || '3', 10),
        });
        console.log(JSON.stringify(f, null, 2));
        break;
      }
      case 'resolve': {
        const f = lib.resolveFollowup(file, opts.followup, opts.with);
        console.log(JSON.stringify(f, null, 2));
        break;
      }
      case 'schedule-reviews': {
        const r = lib.scheduleReviews(file, opts.project);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'due-reviews': {
        const d = lib.dueReviews(file, new Date(), parseInt(opts.days || '7', 10));
        console.log(JSON.stringify(d, null, 2));
        break;
      }
      case 'stale-followups': {
        const s = lib.stalefollowups(file);
        console.log(JSON.stringify(s, null, 2));
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
