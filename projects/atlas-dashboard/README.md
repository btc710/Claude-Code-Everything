# atlas-dashboard

The live version of the **Atlas cockpit** — the workflow consultant UI that pairs
scope intake with a 12-model backtest gate and a 30/90/180 review cadence.

This is the deployed counterpart to the static mockup at
[`projects/jarvis-dashboard-mockup/index.html`](../jarvis-dashboard-mockup/index.html).

## What it shows

- Center pulsing orb with three rotating rings (CSS-only animation)
- 8-node mindmap of the active workflow (HubSpot CRM, Calendar, Meet, etc.)
- Scope confidence card with the current avg backtest score and the **750 floor**
- 12-row backtest grid, one row per model slot
- 30 / 90 / 180 review cadence cards
- Open consultation questions (the open scope items Atlas still needs answered)
- Bottom transcript bar with an animated wave and **Answer N questions** CTA

## Run locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

Scripts:

| Script        | What it does                                |
| ------------- | ------------------------------------------- |
| `npm run dev`   | Next dev server with hot reload             |
| `npm run build` | Production build                            |
| `npm run start` | Serve the production build                  |
| `npm run lint`  | `next lint`                                 |

## Deploy to Vercel

```bash
vercel link
vercel deploy --prod
```

`vercel.json` pins the region to **iad1** and lets Vercel pick the framework
preset for Next 14.

## Architecture

```
                        ┌──────────────────────┐
                        │  atlas-dashboard     │  ◄── this package
                        │  (Next 14 App Router)│
                        │                      │
   browser ──HTTPS──►   │  app/page.tsx        │
                        │  app/api/projects    │──► atlas-project-ledger
                        │  app/api/backtest    │──► atlas-model-gateway
                        │  app/api/healthz     │
                        └──────────────────────┘
                                  │
                                  │ both sibling packages live in this repo
                                  │ and are `require()`'d as CommonJS at
                                  │ runtime from the Next.js API routes.
                                  ▼
                  ┌────────────────────┐    ┌────────────────────┐
                  │ atlas-project-ledger│   │ atlas-model-gateway │
                  │ (JSON-backed       │   │ (12-slot LLM proxy │
                  │  ledger CLI/SDK)   │   │  + scoring fan-out)│
                  └────────────────────┘    └────────────────────┘
```

### Wiring it to the real services

Today both API routes return **demo fixtures** from `lib/demo.ts` so the
deployed Vercel project renders without any sibling services running.

When we're ready to wire the real backend:

- `app/api/projects/route.ts` should `require('atlas-project-ledger')` and
  proxy to `listProjects()` / `createProject()`.
- `app/api/backtest/route.ts` should `require('atlas-model-gateway')`'s
  `runBacktest({ plan, tenant, project })` from `src/backtest.js`. The
  response shape this route returns is already identical to that module's
  output, so the swap is mechanical.

`next.config.js` already marks both packages as
`serverComponentsExternalPackages` so Next's bundler won't try to inline
them — Node resolves them at runtime via the workspace path.

## Conventions

- **TypeScript / ESM** here (Next 14 App Router requires it) — the rest of
  the repo is CommonJS Node.
- File naming: lowercase with hyphens; React components are PascalCase
  filenames as is conventional for React.
- Color palette and animation timings mirror the mockup exactly; see
  `tailwind.config.ts` and `app/globals.css`.

## Health check

```
GET /api/healthz  →  { "ok": true, ... }
```
