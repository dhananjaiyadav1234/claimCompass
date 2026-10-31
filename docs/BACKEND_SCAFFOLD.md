> **Note:** superseded in part by `docs/API_CONTRACT.md` and `docs/FRONTEND_INTEGRATION.md`. The Next.js foundation now exists in this repo; the "copy src/" install steps below are historical.

# ClaimCompass 2.0 — Backend Scaffold

Backend starter for the ClaimCompass hackathon MVP. Designed for an existing Next.js App Router + TypeScript repository.

## What is included
- Typed case, agent, evidence, recommendation and investigation contracts
- Zod request validation
- API routes for cases, investigations, SSE events, results and complaint drafts
- Investigation orchestrator with a real adaptive branch
- Agent interfaces and explicit unconfigured adapters
- In-memory store for hackathon development
- No fake successful browser results

## Important
The TinyFish integration is deliberately an adapter boundary, not a fabricated SDK implementation. Connect it to the exact TinyFish SDK/API version available in your project after checking its installed package/docs. Until configured, agents return `failed` with `TINYFISH_NOT_CONFIGURED`; the UI should show that honestly.

## Install
Copy the `src/` directory into your existing Next.js project. Merge the `package.json` dependencies into your existing package file, then run:

```bash
npm install
```

Add the environment variables from `.env.example` to `.env.local`.

## API routes
- `POST /api/cases`
- `POST /api/investigations`
- `GET /api/investigations/:id/events` — Server-Sent Events
- `GET /api/investigations/:id/results`
- `POST /api/complaints`

## In-memory persistence
This scaffold uses a process-local Map to keep the first integration simple. It is suitable only for local development/demo in a single server process. Replace `src/lib/store.ts` with Supabase/Postgres before deploying to a multi-instance environment.

## Integration sequence
1. Agree on the shared TypeScript contracts with the frontend teammate.
2. Implement `src/lib/tinyfish/client.ts` using the installed TinyFish SDK/API.
3. Implement each agent in `src/lib/agents/`.
4. Test each agent independently and ensure every finding has an official source URL.
5. Run one full investigation and verify the conditional service-centre branch.
6. Connect the frontend to the API routes.

## Evidence rules
- Never invent policy clauses, service centres, addresses, phone numbers or recovery values.
- Every factual finding must have a source URL and evidence excerpt where available.
- Use `verified`, `potentially_applicable`, `unverified`, `not_applicable`, or `unknown` carefully.
- A purchase price is not a guaranteed recovery amount.


The investigation endpoint creates its ID synchronously and launches the local async runner in the background. This is suitable for local development/demo only; use a durable job queue for multi-instance hosting.
