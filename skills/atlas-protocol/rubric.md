# Atlas Back-test Rubric

Each of the 12 models scores a plan on this fixed rubric and returns:

```json
{
  "model": "<slot identifier>",
  "total": 0-1000,
  "dimensions": {
    "scope_completeness": 0-100,
    "feasibility": 0-100,
    "risk_coverage": 0-100,
    "estimate_calibration": 0-100,
    "dependency_clarity": 0-100,
    "success_criteria": 0-100,
    "observability": 0-100,
    "failure_modes": 0-100,
    "reversibility": 0-100,
    "stakeholder_alignment": 0-100
  },
  "weakest_dimension": "<name>",
  "specific_concerns": ["..."]
}
```

`total` is the sum of dimensions (max 1000).

## Dimensions (each 0–100, weighted equally)

1. **Scope completeness** — Does the plan address every stated intent? Are unstated-but-implied requirements surfaced?
2. **Feasibility** — Is the plan technically achievable with the listed resources and constraints?
3. **Risk coverage** — Are the top risks named and mitigated?
4. **Estimate calibration** — Are the three-point estimates realistic, given comparable past work?
5. **Dependency clarity** — Is the critical path obvious? Are blockers named?
6. **Success criteria** — Are acceptance criteria observable, measurable, and time-bounded?
7. **Observability** — Will we know when this stops working, and how fast?
8. **Failure modes** — Are the top 3 likely failures identified, with runbooks or mitigations?
9. **Reversibility** — If the plan turns out to be wrong, how cheaply can we roll back?
10. **Stakeholder alignment** — Have decision-makers, reviewers, and affected parties been mapped and notified?

## Pass criteria

- Every individual model `total` ≥ **750**.
- Mean across all 12 models ≥ **750**.
- No single dimension averages below **70** (i.e. 700 out of 1000 weighted).
- Any model that names a `specific_concern` that flips a "yes" acceptance criterion to "no" forces a revision regardless of score.

## On failure

1. Sort dimensions by lowest average score.
2. Open the weakest dimension's section of the plan.
3. Revise specifically — do not rewrite the whole plan.
4. Re-run the gate. Repeat until pass.

If three revision cycles fail to clear the gate, escalate: the project as scoped may not be feasible, or the constraints need to change.

## Prompt template for each backtest model

```
You are reviewing a project plan. Score it on the Atlas rubric.

PLAN:
<full plan text including scope card and estimate>

RUBRIC DIMENSIONS:
<paste 10 dimensions above>

Return ONLY a JSON object matching this schema:
{
  "model": "<your slot>",
  "total": <sum of dimensions>,
  "dimensions": {<each 0-100>},
  "weakest_dimension": "<name>",
  "specific_concerns": ["concern 1", "concern 2"]
}

Be ruthless on weak dimensions. The floor is 750 — anything you'd score below 750 must have its lowest dimension named in `specific_concerns`.
```
