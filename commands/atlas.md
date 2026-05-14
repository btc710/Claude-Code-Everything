---
description: Run the Atlas Protocol on a project — deep research, three-point estimate, 12-model backtest gate (≥750 floor), follow-up log, and 30/90/180 review schedule
argument-hint: <project description, or blank to start from the current task in context>
---

# /atlas

Invokes the **Atlas Protocol** (see `skills/atlas-protocol/SKILL.md`). Walks through Phases 1–3 in this session, produces persistent artifacts under `atlas/<project-slug>/`, and books the follow-through reviews.

**Input**: $ARGUMENTS

---

## Phase 1 — Deep Research

1. Take the input. If empty, summarize the current conversation as the project goal and confirm with the user.
2. Capture intents one-per-line. Number them. Quote where the user said something.
3. Map stakeholders, constraints, prior art (search the codebase with `Explore`), and unknowns.
4. Write the **scope card** to `atlas/<slug>/scope.md`.
5. Pause and present the open questions from the Unknown register. **Do not advance to Phase 2 until they are answered or explicitly deferred.**

## Phase 2 — Estimate

1. Break the scope into units of ≤ half a day each.
2. For each unit: best / likely / worst hours, dependencies, owner.
3. Compute PERT and critical path.
4. Add 20% reserve.
5. Write the **estimate** to `atlas/<slug>/estimate.md` (table form).

## Phase 3 — Back-test Gate

1. Load the rubric from `skills/atlas-protocol/rubric.md`.
2. For each of the 12 model slots, send the plan + rubric, get scored JSON back.
   - When the user is in Claude Code, prefer parallel `Agent` calls to subagents whose `model` frontmatter covers different Claude tiers (opus/sonnet/haiku). Surface the remaining 9 slots as "external models to invoke" so the user can run them via API, paste results back, or accept N=3 with a warning that the gate is partial.
3. Aggregate scores. Compute mean, min, dimension averages.
4. Write the **backtest report** to `atlas/<slug>/backtest.md`.
5. **Pass criteria**: every score ≥ 750, mean ≥ 750, no dimension average < 700.
6. On fail: revise the weakest dimension only, re-run. Up to 3 cycles.

## Phase 4 — Follow-up (continuous, until delivery)

1. Maintain `atlas/<slug>/followups.md` with columns: `id | topic | owner | asked_on | unblock_by | status | resolved_with`.
2. Every scope change re-triggers the backtest gate.
3. Every closed item gets its rationale logged.

## Phase 5 — Follow-through

1. On acceptance, write `atlas/<slug>/reviews.md` with three sections dated +30d, +90d, +180d from today.
2. Use `mcp__dc292911-...__create_event` (Google Calendar) to actually book the three review meetings if a calendar MCP is connected.
3. Each review section is filled in on its date — see `skills/atlas-protocol/SKILL.md` for the questions each review answers.

---

## Output structure

```
atlas/
  <project-slug>/
    scope.md          # Phase 1
    estimate.md       # Phase 2
    backtest.md       # Phase 3 (re-run on scope change)
    followups.md      # Phase 4 (live)
    reviews.md        # Phase 5 (30/90/180)
```

## Refusal conditions

Refuse to start execution while:
- The scope card has unanswered unknowns marked `blocking`.
- The backtest gate has not passed.
- Any individual backtest score is below the 750 floor.

Refuse to lower the floor. Revise the plan instead.
