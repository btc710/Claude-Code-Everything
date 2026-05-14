---
description: Run a bounded Atlas multi-agent pilot pass (lead-gen, follow-up, pricing, or retention) via the orchestrator and guardian.
---

# /atlas-run

Kick off one bounded pass of the Atlas pilot. Specialist agents do the work, the guardian reviews, and the operator gets a single consolidated artifact.

## Usage

```
/atlas-run <scope> [--inputs <path-or-paths>] [--note "<one line>"]
```

`<scope>` must be one of:

- `lead-gen` — surface new commercial prospects
- `follow-up` — review stale CRM follow-ups
- `pricing` — first-pass quote for a named opportunity (pass the opportunity in `--note`)
- `retention` — at-risk account sweep with play recommendations

If `<scope>` is omitted, ask the operator which scope to run. Do not default silently.

## What Happens

1. **Frame the run** — `atlas-orchestrator` confirms scope, inputs, and decision rights with the operator. If a required input is missing for the chosen scope (see `skills/atlas-pilot/SKILL.md` "Inputs the Pilot Expects"), it stops and asks rather than guessing.
2. **Delegate to specialists** — the orchestrator routes the work using the minimum specialist sequence for the scope:
   - `lead-gen` → `atlas-market-intel` → `atlas-customer-insight` (dedupe)
   - `follow-up` → `atlas-customer-insight`
   - `pricing` → `atlas-customer-insight` → `atlas-pricing`
   - `retention` → `atlas-customer-insight` → `atlas-retention`
3. **Guardian review** — every artifact passes through `atlas-guardian`. A `block` verdict routes findings back to the originating specialist with notes; nothing reaches the operator until the run clears.
4. **Surface one artifact** — the orchestrator returns a single consolidated artifact with plan, findings, guardian verdict, operator decisions needed, and the recommended next action.

## Examples

```
/atlas-run lead-gen
/atlas-run follow-up --inputs contexts/atlas-crm.csv
/atlas-run pricing --note "Acme Property Mgmt — 4-site weekly commercial route"
/atlas-run retention
```

## Output

Single artifact in the form documented in `agents/atlas-orchestrator.md`. The operator decides next steps; the command does not auto-send anything customer-facing.

## Notes

- This is a pilot. Keep runs bounded. Pick one scope per pass.
- The guardian is the last gate. Treat a `warn` as a real signal and a `block` as non-negotiable.
- For weekly cadence and the full pilot model, see `skills/atlas-pilot/SKILL.md`.
