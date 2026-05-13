---
name: atlas-protocol
description: Project intake protocol that enforces deep research, three-point estimate, 12-model backtest gate (750 score floor), follow-up tracking, and 30/90/180 day post-mortem reviews. Activate this skill at the start of any new project, feature, or non-trivial task — it produces the scope card, estimate, backtest report, follow-up log, and review schedule before execution begins.
origin: ECC
---

# Atlas Protocol

A repeatable intake protocol so every project gets the same prompt-engineering rigor: deep research, sized estimates, multi-model backtest before execution, tracked follow-up, and scheduled follow-through. Inspired by the Atlas dashboard mockup at `projects/jarvis-dashboard-mockup/` — this skill is the executable form of what the orb does on screen.

## When to Use

- A new project, feature, or task is requested and execution would take more than ~30 minutes.
- A previous project crossed scope and you need to re-anchor.
- You catch yourself coding before the open questions are answered.
- Anyone says "just ship it" before backtest has passed.

Do **not** use for: typo fixes, single-line bug fixes, mechanical refactors, or tasks that are already mid-flight (apply the next-applicable phase instead).

## Core Concepts

- **Scope card** — the single source of truth for what's in. Lives in the project root or task tracker. Updated continuously.
- **Back-test gate** — a plan is not "ready" until 12 models score it ≥750 each on a fixed rubric, mean ≥750. Anything below the floor must be revised before execution starts.
- **Follow-up log** — open questions and blockers tracked with owners and unblock-by dates. Stale items get pinged automatically.
- **Follow-through cadence** — 30/90/180 day reviews are calendared the moment the project is accepted, not added later when problems show up.
- **Drift detector** — any change to scope re-runs the backtest. No silent scope creep.

## How It Works

### Phase 1 — Deep Research

Goal: understand the full problem before producing a plan. Output is the **scope card**.

1. **Intent capture** — write down every stated goal as a separate intent. Number them. Do not paraphrase; quote where possible.
2. **Stakeholder map** — who decides, who reviews, who is affected. Note their access constraints.
3. **Constraint surfacing** — hard constraints (compliance, deadlines, budgets, infra) and soft constraints (style, team prefs). List them.
4. **Prior-art audit** — search the codebase, related repos, and external references for anything that solves a piece of this. Note what to reuse vs. avoid.
5. **Unknown register** — every thing you don't know but need to. These become the initial follow-up log.
6. **Success definition** — observable, time-bounded criteria. "X works for Y user, measured by Z, by date D."

The scope card is **not** complete until every intent has at least one acceptance criterion and every unknown has an owner.

### Phase 2 — Estimate

Goal: a sized, dependency-aware estimate with calibrated uncertainty.

1. **Work breakdown** — break the scope into units no larger than a half-day.
2. **Three-point estimate** — for each unit: best / likely / worst (in hours or days). Use PERT formula `E = (best + 4*likely + worst) / 6` for the rolled-up estimate.
3. **Dependency graph** — list each unit's blockers. Longest dependency chain = critical path.
4. **Assumption log** — every "I'm assuming…" goes here, dated. If an assumption breaks, re-estimate.
5. **Reserve** — add 20% contingency for unknowns of unknown size.

### Phase 3 — Back-test Gate

Goal: catch flaws in the plan before execution. The plan must clear the gate.

**The 12 model slots** (swap in the latest available; keep representation across vendors):

| Slot | Model class                  | Notes                          |
|------|------------------------------|--------------------------------|
| 1    | claude-opus-4-7              | reasoning anchor               |
| 2    | claude-sonnet-4-6            | balanced workhorse             |
| 3    | claude-haiku-4-5             | fast counter-checker           |
| 4    | claude-opus-4-6              | prior-gen reasoning sanity     |
| 5    | gpt-5 (or latest GPT)        | cross-vendor reasoning         |
| 6    | gpt-5-mini                   | fast cross-vendor              |
| 7    | gemini-2.5-pro               | long-context reviewer          |
| 8    | gemini-flash                 | fast Google                    |
| 9    | grok-4                       | adversarial perspective        |
| 10   | llama-4-405b                 | open-weights baseline          |
| 11   | mistral-large                | EU/independent perspective     |
| 12   | deepseek-v3                  | code-heavy reviewer            |

**Score rubric** — see `skills/atlas-protocol/rubric.md`. Each model returns one score 0–1000 plus per-dimension scores.

**Pass criteria**:
- Every individual model score ≥ **750**.
- Mean across the 12 ≥ **750**.
- No single dimension averages below 700.

**On failure**: identify the weakest dimension, revise that section of the plan only, re-run. Do not lower the floor.

The result is the **backtest report** — committed alongside the scope card.

### Phase 4 — Follow-up

Goal: nothing falls through the cracks between plan and delivery.

1. **Follow-up log** — every open question, blocker, and waiting-for-X item. Columns: `id`, `topic`, `owner`, `asked_on`, `unblock_by`, `status`, `resolved_with`.
2. **Ping cadence** — anything older than `unblock_by` gets a nudge the next workday. Nothing goes silent.
3. **Decision log** — when a question resolves, the answer plus its rationale is captured. Future-you and any reviewer can reconstruct why.
4. **Scope re-validation** — when an answer changes scope, re-run the backtest gate before continuing.

### Phase 5 — Follow-through

Goal: confirm the project works in the real world and catch failures before they compound.

**Delivery verification** (day of handoff):
- All acceptance criteria from the scope card pass.
- Observability is in place — you can detect when it stops working.
- Runbook exists for the top 3 failure modes from the backtest report.

**30-day review** (calendared at acceptance):
- Adoption metrics — is it actually used?
- Drift signals — has the system or its dependencies changed?
- Open follow-ups that haven't closed.
- Action: nudge or patch, don't redesign.

**90-day review**:
- Incident log — every failure since 30d, with RCA template applied.
- Failure-mode forecast — what's likely to break next, given what we've seen?
- Action: pre-emptive fixes (the "fix issues before they happen" pass).

**180-day review**:
- Scope-creep audit — what got added that wasn't in the original scope card? Why?
- Rebaseline decision — keep, sunset, or rewrite.
- Backtest the current state against the original gate. If it would no longer pass, this is a forcing function.

## Examples

### Activating the protocol

```
> /atlas New project: build a HubSpot → Google Meet → email integration.
```

Atlas walks through Phases 1–3, produces a scope card with 14 intents, a 12-row backtest report (mean 812), and books the 30/90/180 reviews. Execution does not start until the user resolves the open questions surfaced in Phase 1.

### Stopping mid-flight when scope changes

A user mid-build says "actually also CC the team." Atlas updates the scope card with a new intent, re-runs the backtest (which drops to 738), highlights that the calendar-invite branch now scores below the floor, and asks the question that resolves it before unblocking.

### A 90-day review surfaces a future failure

The 90-day review notices that the contact-lookup endpoint has had two timeouts in the last week. Atlas opens a follow-up entry to add a retry/backoff, runs the patched plan through the backtest gate (passes at 798), and ships the fix before the rate of failures rises.

## Anti-patterns

- **Skipping the gate** because "the plan is obviously fine." If it's obvious, it scores high. Run it anyway.
- **Lowering the floor** to make a plan pass. Revise the plan, not the standard.
- **Adding reviews retroactively** when problems appear. The cadence is the point.
- **One-model backtest** — a single model has the same blind spots as itself. Diversity is the safeguard.
- **Hidden scope changes** — every accepted change must update the scope card and re-trigger the gate.
