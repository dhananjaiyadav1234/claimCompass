## Frontend integration

1. POST case fields to `/api/cases`.
2. POST `{ caseId }` to `/api/investigations`.
3. Subscribe to `/api/investigations/{id}/events` using `EventSource`.
4. Poll `/api/investigations/{id}/results` when the `complete` event arrives.
5. POST `{ caseId, investigationId }` to `/api/complaints`.

## Important implementation note

Before relying on this scaffold, have Claude review and correct the investigation-start lifecycle. The included in-memory approach is intentionally a starting point, not production-grade durable orchestration. A robust hackathon implementation should create and save an investigation ID synchronously, then launch the async job using that ID. Use a module-level job runner for local development or a durable queue if already configured.
