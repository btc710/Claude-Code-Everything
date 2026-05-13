# Resale Workstation AI — CEO Plan (v0.1)

> Target: **$1,500,000 in completed resale sales by 2027-12-31** from a shared-shop
> footprint, with full-building item + body tracking and an AI workstation that
> trends toward autonomous operation. Authored 2026-05-13.

This document is the CEO-level brief I would hand to engineering, ops, and
finance on day one. Only components scoring **>750/1000** on the rubric are
included in the recommended build. Items scoring 750 or below are listed in
**§9 Cuts** with the reason they were dropped so we don't relitigate them.

---

## 1. Goal arithmetic — does $1.5M by 2027-12-31 actually pencil?

From today (2026-05-13) to 2027-12-31 is **~20 months**.

| Scenario | Avg sale price | Sales/mo (avg) | Sales/mo (peak) | Comment |
|---|---|---|---|---|
| A — small goods heavy | $22 | 3,409 | 5,400 | Throughput-bound; only works with auto-listing |
| B — balanced mix (**target**) | $42 | 1,786 | 2,800 | Realistic for shared-shop + cross-listing |
| C — furniture/electronics heavy | $95 | 789 | 1,250 | Capital-bound; logistics-heavy |

**Recommended profile: B.** Ramp profile (cumulative GMV):

```
Month  1-3   4-6   7-9  10-12 13-15 16-18 19-20
GMV/mo $20k  $40k  $65k  $85k $100k $115k $130k
Cum.   $60k $180k $375k $630k $930k $1.275M $1.535M
```

Hits **$1.535M by end of M20** = end of 2027. Buffer = $35k. Anything that
slips the M4–M9 ramp by even one month puts the goal at risk; that window is
where workstation throughput must be proven, not the back half.

**Score: 820/1000.** Achievable but with thin margin — every fallback below
exists to protect the M4–M9 ramp.

---

## 2. System architecture (only sections scoring >750)

### 2.1 Resale Workstation — agent topology  *(score: 880)*

Six specialized agents behind a single operator console. Each has a defined
SLA, a confidence floor, and a manual-override path.

| Agent | Job | Target latency | Confidence floor | Fallback |
|---|---|---|---|---|
| **Intake** | Photo capture → condition grade → category → comps → price | ≤ 90s/item | 0.80 | Drop to review queue |
| **Listing** | Cross-post to eBay, Mercari, Poshmark, FB Marketplace, Whatnot, Shopify | ≤ 60s/channel | 0.85 | Hold + notify |
| **Comm** | Buyer Q&A + bounded negotiation | ≤ 5 min response | 0.75 | Escalate to human |
| **Fulfillment** | Pick list → pack → label → carrier handoff | ≤ 8 min/order | n/a (rules) | Manual pick path |
| **Pricing** | Reprice based on velocity, age, comp shifts | nightly batch | 0.70 | Freeze price |
| **Triage** | Duplicates, fraud, problem SKUs, consignment splits | ≤ 30s/event | 0.90 | Human queue |

Operator console = one screen showing the queue depth for each agent, the
top-3 stuck items, and a single big "stop the line" button. Everything else
is a drill-down.

### 2.2 Per-item tracking ledger  *(score: 910)*

Every physical object — resale inventory, shared-shop business equipment, and
purchased (consigned) inventory — gets an entry in one ledger keyed by a
short URL-safe ID (e.g. `ITM-7QF2R`). The same ID is the QR code on the item
and the row key in the database.

Required columns: `id`, `class` (`resale|business|consigned`), `owner`,
`acquired_at`, `cost_basis`, `current_location_zone`, `last_seen_at`,
`condition_grade`, `listing_ids[]`, `status`, `disposition_target`.

**Why one ledger, not three:** if business-use and resale share a building,
they share theft risk, audit needs, and movement events. A single ledger
with a class column avoids the "is this ours or for sale?" ambiguity that
kills shared shops.

### 2.3 Indoor tracking stack  *(score: 790)*

Three sensing layers, all feeding the ledger:

1. **QR-on-everything** — printed at intake, scanned at each station
   (intake, photo, storage, pick, pack, ship). Source of truth for state
   transitions. Cheap, deterministic, works offline.
2. **WiFi/PoE camera mesh** — UniFi Protect or Reolink PoE cameras + Frigate
   running on a local mini-PC for person detection, dwell-time heatmaps,
   and shelf-zone occupancy. **Local NVR, not cloud-only**, so a WAN outage
   doesn't blind the building.
3. **BLE shelf beacons** — one beacon per shelf-zone, scanned by handheld
   readers and the operator station, gives last-known zone for any item
   that hasn't been QR-scanned in N hours.

Coverage rule: every square meter must be visible to **two** cameras or
covered by **one camera + one BLE zone**. Single-sensor coverage is treated
as a gap and flagged on the floor-plan heatmap weekly.

### 2.4 Body tracking via cameras — scoped  *(score: 770)*

In-scope: person detection, re-ID across cameras for the same shift, dwell-
time per zone, after-hours presence alerts, two-person rule for high-value
zones (e.g. electronics safe).

**Out of scope (explicit cuts):** face recognition database, off-site
tracking, retention beyond 30 days, sharing footage with third parties
without a warrant or written request, biometric templates of any kind.

Legal snag flagged: **state biometric laws vary sharply** (Illinois BIPA,
Texas CUBI, Washington HB 1493, evolving CCPA/CPRA in California). The
chosen scope avoids biometric-identifier definitions in all four, but
**confirm with counsel before turning on re-ID**, and post signage at every
entrance. This is non-negotiable; it's both the legal floor and what keeps
staff trust intact.

### 2.5 Listing pipeline — cross-posting  *(score: 860)*

Channels in priority order: eBay (45% of GMV target), Shopify direct (20%),
Mercari (12%), Poshmark (10%), FB Marketplace (8%), Whatnot live (5%).

**Single canonical listing object** per item, with channel-specific adapters
that transform it for each platform's quirks (eBay item-specifics, Poshmark
size taxonomy, FB local-pickup radius). When an item sells on any channel,
the adapter layer pulls it from all others within 60s — this is the most
common revenue-leak failure mode for resellers and worth gold-plating.

### 2.6 Pricing engine  *(score: 800)*

Pricing model = **base comp (median sold, 90-day) × velocity multiplier ×
condition modifier × channel modifier**, with a **floor** at `1.4 × cost_basis`
and a **ceiling** at `1.1 × median asking`. Items with no comp fall to a
human queue rather than guessing.

Reprice cadence: nightly for items <30 days, weekly for 30–90 days, then a
**markdown ladder** at 90/120/150 days, with auto-donate at 180 days for
items with cost basis under $15 (don't let the warehouse fill with dead
weight — this is what kills capacity in M9–M12).

### 2.7 Fallback / autonomy ladder  *(score: 870)*

Five levels, each item knows which level it's at:

| Level | Name | Human touch | Use when |
|---|---|---|---|
| L0 | Manual | 100% | New SKU classes, high-value (>$300) |
| L1 | Assisted | Human approves each step | Bootstrapping; first 30 days of a category |
| L2 | Reviewed | Human reviews queue, batched | Default for M2–M6 |
| L3 | Auto + sample | Human audits 10% sample | Default for M7+ |
| L4 | Autonomous | Human only on exceptions | Mature SKU classes after 90 days at L3 |

**No item skips levels.** An item moves up only after N days of clean
performance at the current level. This is the single most important rule
for not blowing up on autonomy — it's how we stop a bad prompt update from
mispricing 3,000 items overnight.

### 2.8 Data + observability  *(score: 810)*

One Postgres database (the ledger + listings + events). All agent actions
write to an append-only `events` table with `actor`, `item_id`, `before`,
`after`, `confidence`, `model_version`. This is what makes incident
forensics possible — when revenue drops on a Tuesday, you need to be able
to ask "what changed in the last 24h" and get an answer in one query.

Dashboards: queue depth per agent, sell-through by category and age bucket,
list-to-sale time, dispute rate, camera/sensor uptime, autonomy-level
distribution. Refresh every 5 minutes. **Alert before the customer
notices** — page on dispute rate >2% (24h), sell-through <40% (28d), any
agent confidence floor drift >0.05 week-over-week.

---

## 3. Failure-mode look-ahead

Each row: what fails, when, why, the early signal, the planned response.

| Month | Failure | Root cause | Early signal | Response |
|---|---|---|---|---|
| **M+3** | Pricing agent over-discounts a category | Stale comps; comp source rate-limited; silent fallback to defaults | Sell-through spikes but margin drops | Hard floor at `1.4× cost_basis`, alert on margin <30% |
| **M+3** | Listing flagged for ToS on Poshmark | Auto-generated copy uses banned brand phrasing | Listing rejection rate >2% on one channel | Per-channel banned-term list; channel-aware copy templates |
| **M+6** | Shared-shop ownership disputes | `class` column not set at intake; ambiguous item ends up listed | "Whose is this?" Slack messages | Mandatory class+owner at intake; bright tape colors per class |
| **M+6** | Staff resentment of cameras | Re-ID enabled without communication, no opt-in for break areas | Quiet quitting, complaints to HR | Written policy, signage, break-area exclusion zones, scope §2.4 |
| **M+9** | Capacity ceiling at pack station | Intake outruns fulfillment; aging inventory blocks shelves | Pick-to-ship time >24h | Markdown ladder + auto-donate at 180d; second pack station |
| **M+12** | Comp drift on electronics | Used-electronics prices fall faster than reprice cadence | Sell-through on category <30% | Weekly reprice for electronics; per-category cadence config |
| **M+12** | Camera blind spot exploited | Coverage gap missed in weekly review; theft cluster in one corner | Inventory shrinkage in one zone | Two-sensor coverage rule (§2.3); weekly heatmap audit |
| **M+15** | Cross-list desync — sold twice | Adapter pull-down race condition under load | First "I bought this and it's gone" buyer message | Distributed lock on sale event; 60s pull-down SLA + monitoring |
| **M+18** | Revenue plateau at ~$95k/mo | One-channel concentration, no new categories | GMV flat for 6 weeks | Whatnot live + new category pilots (each at L1, 30d ramp) |
| **M+20** | Misses $1.5M by ~$80k | M4–M9 ramp slipped by 1 month, never recovered | Monthly GMV vs. plan, M+4 onward | Run the ramp model monthly; if M+5 is below plan, escalate immediately |

---

## 4. Snags to flag now (before kickoff)

1. **Legal / biometric scope.** §2.4 has to clear local counsel before any
   re-ID is enabled. Default to off until signed off.
2. **Insurance.** Shared-shop space + camera tracking + consigned inventory
   = three policies that need to be reconciled (general liability, business
   contents, bailee/consignment). Get a broker review before $50k of
   consigned goods is on premises.
3. **Sales-tax nexus.** Cross-state shipping creates economic-nexus exposure
   in ~30 states above varying thresholds. Stand up tax automation
   (TaxJar / Avalara) before M+3, not at M+6 when it becomes painful.
4. **Platform account health.** eBay, Mercari, Poshmark each have policies
   that can permaban an account for AI-generated copy that breaks subtle
   rules. **Manual review of the first 200 auto-listings on every new
   channel** — this is non-negotiable and accounted for in L0/L1.
5. **Shared-shop access control.** Who can scan QR codes? Who can move
   items between class buckets? RBAC must exist on day one, even if it's
   crude. Without it, the audit trail in §2.8 is unreliable.
6. **Staff training & buy-in.** Cameras + AI + new SOPs land badly if
   sprung on staff. Two weeks of training before L2 turns on; staff sees
   their own metrics first, not management's view of them.
7. **Power / network resilience.** A 4-hour ISP outage during a Saturday
   bulk-listing session wipes a week of ramp. UPS on the NVR + tracking
   server, LTE failover on the router. ~$1,200 one-time, very high ROI.
8. **Donation / disposal path.** The 180-day auto-donate rule in §2.6
   only works if there's a charity partner pre-arranged. Set it up M+1,
   before the first cohort ages out.

---

## 5. Autonomy ladder — explicit definition of "done"

"Full autonomy" doesn't mean "no humans." It means **a human is on the
exception path, not the happy path**, and the system can run a 7-day week
without a human touching the happy path for any item at L4.

Concrete exit criteria for L4 across the whole workstation:
- ≥ 85% of items by GMV are at L3 or L4
- Dispute rate < 1.5% trailing 30d
- Mispricing rate (manual override > 20%) < 3% trailing 30d
- Cross-list desync incidents = 0 trailing 30d
- Sensor coverage gaps = 0 on the weekly heatmap
- One operator can cover one full shift solo without queue depth growing

Target date for full-workstation L4: **M+12**. Stretch: M+10.

---

## 6. 30 / 60 / 90 day plan

**Days 0–30 — foundations**
- Stand up Postgres ledger + events table (§2.2, §2.8)
- Print QR labels, retrofit existing inventory (target: 100% labeled by D+21)
- Intake station MVP (camera, scale, scanner, station console) — L1 only
- eBay + Shopify adapters live, others stubbed
- Camera mesh installed, person detection on, **re-ID off pending legal**
- Operator console v0: queue depths + stop-the-line

**Days 31–60 — first ramp**
- Listing agent at L2 for soft-goods category
- Pricing engine with hard floor/ceiling
- Mercari + Poshmark adapters
- Markdown ladder live
- First weekly camera-coverage audit; close two gaps minimum
- Begin biometric-scope legal review (target: signed off by D+75)

**Days 61–90 — autonomy step-up**
- Soft-goods to L3 if metrics clear §5
- Hard-goods (electronics, small appliances) onboarded at L1 → L2
- FB Marketplace + Whatnot adapters
- Cross-list desync monitoring + distributed-lock fix shipped
- Tax automation live
- First pack-station capacity stress test (target: 80 orders/day single operator)

After D+90, the cadence shifts to "promote one category per 30 days from
L2 → L3," gated on §5 metrics for that category specifically. No
across-the-board promotions, ever.

---

## 7. Time-efficiency budget per function

Hard SLAs for the workstation operator — if any of these blow, we're not
hitting the ramp:

| Function | Budget | Why |
|---|---|---|
| Intake-to-listed (soft goods) | 4 min/item | M+9 throughput target |
| Intake-to-listed (hard goods) | 9 min/item | Tested on real items M+1 |
| Order-to-label (single item) | 2 min | Pack station capacity |
| Buyer Q response time | 5 min business hours | Conversion rate sensitive |
| Sold-to-pulled (cross-list) | 60 s | Avoids double-sale support cost |
| Daily reconciliation (ops close) | 15 min | Otherwise it gets skipped |

Each of these is dashboarded and tracked as a weekly trend, not a snapshot.

---

## 8. Ease-of-use principles

- **One console for the operator.** If they need a second tab, we failed.
- **No login per channel.** Adapter layer holds the credentials; operator
  authenticates once to the workstation.
- **Stop-the-line is one keypress.** F12 freezes all agents, period.
- **Mistakes are reversible for 24h.** Soft-delete on listings, ledger
  events are append-only so undo is "write the inverse event."
- **The console teaches itself.** Every queue item links to the SOP for
  that exception class. New hires productive on day 2, not week 2.

---

## 9. Cuts — components scored ≤750 and dropped

Listed so we don't relitigate later. Numbers in parentheses are the score
on the same 1–1000 rubric.

- **Full facial-recognition system** (410) — legal exposure (§2.4), staff-
  trust cost, and adds little over zoned dwell-time analytics.
- **RFID-everything** (640) — hardware + tag cost doesn't beat QR + BLE
  at our throughput. Re-evaluate at $5M ARR.
- **Custom-trained condition-grading vision model from scratch** (520) —
  too expensive vs. a multimodal LLM + 200-item human-graded eval set.
  Build the eval set, buy the model.
- **Robotic pick-pack** (380) — capex pre-2028 doesn't pencil at this
  GMV. Single second pack station beats one robot.
- **Owned/in-house ML training pipeline for pricing** (610) — beaten by
  rules + market comps + an LLM for edge cases until at least $3M ARR.
- **Live-stream selling as primary channel** (700) — keep as Whatnot
  supplement, not the spine. Throughput economics don't match.
- **Customer-facing AI chatbot on the storefront** (580) — distracts from
  fulfillment quality, which is the actual conversion driver pre-$1M.
- **Blockchain provenance for consigned items** (180) — solves no problem
  the ledger doesn't already solve. Listed only to be explicit it's out.

---

## 10. Scorecard summary (kept components only)

| Component | Score | Notes |
|---|---|---|
| Goal arithmetic ($1.5M model) | 820 | Tight; M4–M9 ramp is the risk |
| Agent topology | 880 | Six agents, clear SLAs, override paths |
| Per-item ledger | 910 | Single source of truth across three classes |
| Indoor tracking stack | 790 | QR + camera + BLE; two-sensor coverage rule |
| Body tracking (scoped) | 770 | Conditional on legal sign-off |
| Listing / cross-post pipeline | 860 | Adapter pattern, 60s pull-down SLA |
| Pricing engine | 800 | Floor/ceiling + markdown ladder + auto-donate |
| Autonomy ladder | 870 | No skipping levels; per-category promotion |
| Data + observability | 810 | Append-only events, dashboards, alerts |

Weighted-average score across kept components: **836/1000.**

---

## 11. What I need from you (CEO → owner sign-off)

Decisions blocking kickoff:
1. **Biometric scope sign-off** (§2.4) — yes/no on engaging counsel this week.
2. **Capex envelope D0–D90** — cameras, NVR, BLE, scanners, second pack
   station. Rough budget: **$14k–$22k** depending on camera count.
3. **Headcount** — minimum two operators by D+30 to run intake + pack in
   parallel; the ramp model assumes this from M+1.
4. **Charity partner** for the 180-day auto-donate path (§4.8).
5. **Confirmation of the $1.5M target** — or if the real number is
   "1.5M GMV" vs. "1.5M net" we need to re-run §1 with margin assumptions.

Default if I hear nothing in 5 business days: proceed on §6 Days 0–30 with
re-ID off, $18k capex envelope, two operators, and treat the $1.5M as GMV.
