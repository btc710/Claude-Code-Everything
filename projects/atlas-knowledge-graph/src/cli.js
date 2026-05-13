#!/usr/bin/env node
'use strict';

const path = require('path');
const lib = require('./index');

const DEFAULT_FILE = process.env.ATLAS_GRAPH_FILE
  || path.resolve(process.cwd(), '.atlas/graph.json');

function usage() {
  console.log(`atlas-graph — Atlas tenant-scoped knowledge graph

  atlas-graph ingest    --ledger <file> --project <id> [--graph <file>]
  atlas-graph recall    --tenant <id> --query "<text>"  [--graph <file>] [--limit <n>]
  atlas-graph related   --tenant <id> --subject "<text>" [--depth <n>] [--graph <file>]
  atlas-graph summarize --tenant <id>                    [--graph <file>]

Env:
  ATLAS_GRAPH_FILE   path to the JSON triple store (default: .atlas/graph.json)`);
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
  const { opts } = parseArgs(rest);
  const file = opts.graph || DEFAULT_FILE;
  try {
    switch (cmd) {
      case 'ingest': {
        if (!opts.ledger) throw new Error('--ledger required');
        if (!opts.project) throw new Error('--project required');
        const triples = lib.ingestProject(file, opts.ledger, opts.project);
        console.log(JSON.stringify({ added: triples.length, triples }, null, 2));
        break;
      }
      case 'recall': {
        if (!opts.tenant) throw new Error('--tenant required');
        if (!opts.query) throw new Error('--query required');
        const limit = parseInt(opts.limit || '10', 10);
        const hits = lib.recall(file, opts.tenant, opts.query).slice(0, limit);
        console.log(JSON.stringify(hits, null, 2));
        break;
      }
      case 'related': {
        if (!opts.tenant) throw new Error('--tenant required');
        if (!opts.subject) throw new Error('--subject required');
        const depth = parseInt(opts.depth || '2', 10);
        const rel = lib.findRelated(file, opts.tenant, opts.subject, depth);
        console.log(JSON.stringify(rel, null, 2));
        break;
      }
      case 'summarize': {
        if (!opts.tenant) throw new Error('--tenant required');
        console.log(JSON.stringify(lib.summarize(file, opts.tenant), null, 2));
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
