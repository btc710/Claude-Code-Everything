# atlas-knowledge-graph

Tenant-scoped knowledge graph for Atlas projects. Every confirmed intent, decision, and resolved follow-up from the project-ledger becomes a triple here, so the next project for the same tenant starts with everything the protocol has already proved.

Sketch #5 in the productization plan. JSON-file backed today; production swaps `src/store.js` for Postgres or a graph DB without touching call sites.

## Why a graph, not a key-value cache

A cache lets you ask "what did we say about X?" — a graph lets you ask "what depends on X, who decided it, and what else did that decision constrain?" The triple `(subject, predicate, object)` is the smallest unit that preserves both the answer and the relationship, so a depth-2 walk from a new project's slug surfaces the past stakeholders, the assumptions that were once written down, and the plan-hash of the decision that locked them in.

## Triple shape

```
{
  id,                  // sha1 of (s,p,o,tenant,project) — re-ingest is idempotent
  subject, subjectRaw, // normalized for search, original for display
  predicate,           // closed vocabulary (see below)
  object,  objectRaw,
  tenantId, projectId,
  confidence,          // 0..1
  asOf,                // ISO timestamp of the source event
  source               // e.g. "ledger:proj_acme1", "backtest:bt_x", "followup:fu_y"
}
```

### Predicates

| Predicate            | Meaning                                                                |
|----------------------|------------------------------------------------------------------------|
| `decided`            | Subject decided X (passing backtest, accepted plan, closed followup)   |
| `confirmed-intent`   | Subject explicitly confirmed they want X                               |
| `resolved-with`      | Question subject was resolved with answer X                            |
| `stakeholder`        | Person X is a stakeholder of the subject                               |
| `constraint`         | Hard constraint X applies to the subject                               |
| `assumption`         | Assumption X is currently baked into the plan                          |
| `dependency`         | Subject depends on X                                                   |
| `risk-mitigated`     | Risk X was mitigated (or noted)                                        |
| `success-criterion`  | Subject's success is judged by X                                       |

## Library use

```js
const lib = require('atlas-knowledge-graph');
const graphFile  = '.atlas/graph.json';
const ledgerFile = '.atlas/ledger.json';

// Pull every project-ledger row for a project into the graph
lib.ingestProject(graphFile, ledgerFile, 'proj_acme1');

// Naive token-overlap recall — point it at a new project brief
const hits = lib.recall(graphFile, 'acme',
  'New recap email automation after the Meet call ends');

// Two-hop walk from a subject slug
const rel = lib.findRelated(graphFile, 'acme', 'hubspot-meet-email', 2);

lib.summarize(graphFile, 'acme');
// → { triples, projects, predicates, topSubjects, topDecisions }
```

## CLI

```bash
node src/cli.js ingest    --ledger .atlas/ledger.json --project proj_acme1
node src/cli.js recall    --tenant acme --query "Recap email after Meet"
node src/cli.js related   --tenant acme --subject hubspot-meet-email --depth 2
node src/cli.js summarize --tenant acme
```

Default store: `.atlas/graph.json` in the current working directory. Override with `ATLAS_GRAPH_FILE=/path/to/file`.

## Test

```bash
node tests/run-all.js
# → 16 passed, 0 failed (3 files)
```

## How it fits with the other Atlas pieces

```
atlas-project-ledger        atlas-knowledge-graph
  projects        ────────▶   confirmed-intent / success-criterion
  backtests (pass)────────▶   decided / risk-mitigated
  followups (closed)──────▶   decided / resolved-with / stakeholder
  followups (open)────────▶   assumption
```

The next time a tenant starts a project, the planner can call `recall(graph, tenant, brief)` first and seed the plan with the decisions, stakeholders, and assumptions that already exist.

## Production hardening (not in this sketch)

- Swap `src/store.js` for Postgres with a `triples` table and indices on `(tenant_id, predicate)`, `(tenant_id, subject)`, and `(tenant_id, object)`.
- Row-level security so the tenant filter is enforced by the DB, not the call site.
- Embedding-backed recall: replace the token-overlap scorer in `src/query.js` with vector similarity behind the same `recall(file, tenantId, freeText)` signature.
- Decay confidence over time and re-affirm triples on re-ingest so stale assumptions surface.
- An ingest worker that subscribes to ledger change events instead of running on demand.
