---
name: atlas-pilot
description: Bounded Atlas multi-agent pilot for an owner-operator franchise. Coordinates a small ecosystem of agents (market intelligence, customer insight, pricing, retention) behind an orchestrator and a guardian reviewer, focused on commercial lead generation, CRM follow-up, pricing support, and retention. Use when running the franchise's Atlas pilot or testing the multi-agent setup against sample data.
origin: ECC
---

# Atlas Pilot

Atlas is a bounded multi-agent pilot for owner-operator franchises. It mirrors the Stora Enso-style pattern from the AI transformation literature: specialist agents do focused work, an orchestrator coordinates, and a guardian reviewer gates every output before it reaches the operator or general manager.

This skill exists so the operator can run a clean weekly cycle without expanding scope before trust is earned.

## When to Activate

- Operator says "run Atlas", "Atlas pilot", "weekly Atlas sweep", or uses `/atlas-run`
- Operator asks for commercial lead generation, CRM follow-up review, pricing support, or a retention sweep against the franchise's own data
- Anyone is testing the multi-agent setup against sample CRM data in `contexts/`

Do NOT activate this skill for:

- Residential lead work (out of pilot scope)
- Direct customer outbound (the pilot drafts; humans send)
- One-off ad hoc questions that do not need the full pipeline

## Architecture

```
                  ┌──────────────────────┐
                  │  atlas-orchestrator  │
                  └─────────┬────────────┘
                            │ (plans + delegates)
   ┌────────────┬───────────┼───────────┬────────────┐
   ▼            ▼           ▼           ▼            ▼
┌────────┐  ┌─────────┐  ┌────────┐  ┌──────────┐
│market- │  │customer-│  │pricing │  │retention │
│ intel  │  │ insight │  │        │  │          │
└───┬────┘  └────┬────┘  └───┬────┘  └────┬─────┘
    │            │           │            │
    └────────────┴───────────┴────────────┘
                      │ (artifacts)
                      ▼
              ┌──────────────────┐
              │  atlas-guardian  │  ← every artifact passes through
              └────────┬─────────┘
                       ▼
                  Operator / GM
```

### Roles in one line each

| Agent | Role |
|-------|------|
| `atlas-orchestrator` | Frames the run, picks specialists, consolidates output |
| `atlas-market-intel` | Surfaces new commercial prospects from public sources |
| `atlas-customer-insight` | Reads CRM exports, snapshots account state, dedupes lists |
| `atlas-pricing` | Proposes a defensible quote range from comps and rules |
| `atlas-retention` | Classifies at-risk accounts and proposes plays |
| `atlas-guardian` | Reviews every artifact for sourcing, PII, scope, rules, tone, reversibility |

## How It Works

### 1. Bounded scope

Each Atlas run picks **one** scope:

- `lead-gen` — find new commercial prospects
- `follow-up` — review stale CRM follow-ups
- `pricing` — first-pass quote for a named opportunity
- `retention` — at-risk account sweep with play recommendations

Multi-scope runs are allowed only after the operator has run each scope cleanly at least twice.

### 2. Specialist sequence

The orchestrator picks the minimum specialist sequence for the scope (see `atlas-orchestrator` for the routing table). Specialists run sequentially when later steps depend on earlier output.

### 3. Guardian gate

Every artifact goes through `atlas-guardian`. Drafts that have not cleared the guardian never reach the operator.

### 4. Operator review

The operator (or GM) gets one consolidated artifact per run with:

- Findings
- Guardian verdict
- Decisions the operator needs to make
- One recommended next action with an owner

## Inputs the Pilot Expects

Place these in the working directory and point the orchestrator at them:

| Input | Example path | Used by |
|-------|--------------|---------|
| CRM export (CSV/JSON) | `contexts/atlas-crm.csv` | customer-insight, retention |
| Activity log | `contexts/atlas-activity.json` | customer-insight |
| Pricing rules | `contexts/atlas-pricing-rules.md` | pricing |
| Won/lost comp set | `contexts/atlas-comps.csv` | pricing |
| Guardrails / play menu | `contexts/atlas-guardrails.md` | retention, guardian |
| Service area + target verticals | `contexts/atlas-target-profile.md` | market-intel |

If a file is missing for the chosen scope, the orchestrator stops and asks rather than guessing.

## Operating Cadence

Recommended weekly rhythm for the pilot:

- **Monday** — `lead-gen` sweep, GM works the top of the list
- **Wednesday** — `follow-up` sweep, GM closes the stale-touch list
- **Friday** — `retention` sweep, operator reviews any acute risk

`pricing` runs on-demand whenever a real commercial opportunity comes in.

Hold weekly review with the operator and GM on:

- What the agents got right
- What the guardian caught
- Where the operator overrode a recommendation
- One thing to tighten next week

## Example: Weekly Lead-Gen Run

```
Operator: /atlas-run lead-gen

Orchestrator:
 - confirms service area, verticals, exclusion list
 - briefs atlas-market-intel
 - briefs atlas-customer-insight to dedupe
 - sends merged list to atlas-guardian
 - returns one consolidated artifact

Artifact:
 ATLAS RUN — lead-gen — 2026-05-15
 Plan: market-intel → customer-insight (dedupe) → guardian
 Findings:
  - market-intel: 14 candidates, top 10 returned, 4 below bar
  - customer-insight: 2 of 14 are existing customers, 1 is a prior-touched lost deal
 Guardian verdict: pass — sources verified, no PII issues, scope held
 Operator decisions needed: none
 Recommended next action: GM to work top 5 by Wed; revisit prior-touched lost deal in retention bucket
```

## Example: Retention Sweep With Block

```
Operator: /atlas-run retention

Artifact:
 Guardian verdict: block
 [HIGH] Rules:
  - retention play for Account #1142 proposes a 15% credit; franchise guardrails authorize max 5% without operator sign-off
 Required actions before re-submit:
  1. Mark the credit as operator approval required, or replace play with a GM check-in call
 Operator decisions needed:
  - Approve a one-time exception, or accept replacement play
```

The operator decides; the agents do not push past a block.

## Anti-Patterns

- Skipping the guardian because the artifact "looks fine"
- Running every specialist on every scope by default
- Drafting and sending customer outbound from the pilot (drafts only; humans send)
- Expanding into residential, marketing campaigns, or contract changes before the bounded commercial scope is consistently clean
- Treating an early agent recommendation as ground truth — the operator's weekly review is the learning loop

## Related

- `agents/atlas-orchestrator.md` — the entrypoint
- `commands/atlas-run.md` — the user-facing command
- Stora Enso and Linde patterns referenced in the operator's AI transformation notes — multi-agent specialization with an orchestrator and a guardian layer
