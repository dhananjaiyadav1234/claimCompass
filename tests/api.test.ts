import { beforeEach, describe, expect, it } from "vitest";
import { POST as createCase } from "@/app/api/cases/route";
import { POST as createInvestigation } from "@/app/api/investigations/route";
import { GET as getResults } from "@/app/api/investigations/[id]/results/route";
import { GET as getEvents } from "@/app/api/investigations/[id]/events/route";
import { POST as createComplaint } from "@/app/api/complaints/route";
import { startInvestigation, type Agents } from "@/lib/orchestrator";
import { evidence, emptyManufacturer, emptySeller, emptyServiceCentre } from "@/lib/agents/shared";
import { store } from "@/lib/store";

const validCase = {
  productName: "Sony WH-CH720N",
  modelNumber: "WH-CH720N",
  seller: "Amazon",
  purchaseDate: "2026-10-10",
  purchasePrice: 4000,
  issueDescription: "Left headphone stopped working",
  location: { city: "Bengaluru", state: "Karnataka" },
};

const post = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeCase() {
  const res = await createCase(post(validCase));
  return (await res.json()).caseId as string;
}

async function readSse(res: Response) {
  const text = await res.text();
  return text.split("\n\n").filter(f => f.includes("data:")).map(f => {
    const lines = Object.fromEntries(f.split("\n").filter(l => /^(id|event|data):/.test(l)).map(l => [l.split(":")[0], l.slice(l.indexOf(":") + 1).trim()]));
    return { id: Number(lines.id), event: lines.event, data: JSON.parse(lines.data) };
  });
}

function agents(over: Partial<Agents> = {}): Agents & { calls: string[] } {
  const calls: string[] = [];
  const a: Agents = {
    seller: { name: "seller", async run() { calls.push("seller"); return emptySeller("completed", "ok"); } },
    manufacturer: { name: "manufacturer", async run() { calls.push("manufacturer"); return emptyManufacturer("completed", "ok"); } },
    serviceCentre: { name: "service_centre", async run() { calls.push("service_centre"); return emptyServiceCentre("completed", "ok"); } },
    ...over,
  };
  return Object.assign(a, { calls });
}

beforeEach(() => store.clear());

describe("POST /api/cases", () => {
  it("creates a case and defaults currency/country", async () => {
    const res = await createCase(post(validCase));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.caseId).toBeTruthy();
    expect(json.case.currency).toBe("INR");
    expect(json.case.location.country).toBe("India");
  });

  it("rejects invalid input with the error shape", async () => {
    for (const bad of [{}, { ...validCase, purchasePrice: -1 }, { ...validCase, purchaseDate: "10/10/2026" }, { ...validCase, purchaseDate: "2999-01-01" }, { ...validCase, location: {} }]) {
      const res = await createCase(post(bad));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    }
  });
});

describe("POST /api/investigations", () => {
  it("returns 202 immediately with ids and URLs, and the record is already persisted", async () => {
    const caseId = await makeCase();
    const res = await createInvestigation(post({ caseId }));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json).toMatchObject({ status: "queued" });
    expect(json.eventsUrl).toBe(`/api/investigations/${json.investigationId}/events`);
    expect(json.resultsUrl).toBe(`/api/investigations/${json.investigationId}/results`);
    // Persisted before any background work has run (runner is deferred to a later tick).
    const stored = store.getInvestigation(json.investigationId);
    expect(stored?.status).toBe("queued");
    expect(store.getEvents(json.investigationId)[0].message).toMatch(/queued/i);
  });

  it("404s for an unknown case and 400s for a bad body", async () => {
    expect((await createInvestigation(post({ caseId: "nope" }))).status).toBe(404);
    expect((await createInvestigation(post({}))).status).toBe(400);
  });
});

describe("results endpoint", () => {
  it("404s for unknown id", async () => {
    const res = await getResults(new Request("http://x"), ctx("missing"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("INVESTIGATION_NOT_FOUND");
  });

  it("returns pending agents, honest money fields and isFinal=false while queued", async () => {
    const caseId = await makeCase();
    const { investigation } = startInvestigation(caseId, agents());
    const json = await (await getResults(new Request("http://x"), ctx(investigation.investigationId))).json();
    expect(json.status).toBe("queued");
    expect(json.isFinal).toBe(false);
    expect(json.seller.status).toBe("pending");
    expect(json.money).toMatchObject({ purchaseValueUnderInvestigation: 4000, confirmedRecovery: null, estimatedRecovery: null });
  });

  it("keeps successful agent results when another agent throws (partial results)", async () => {
    const caseId = await makeCase();
    const a = agents({
      seller: { name: "seller", async run() { return { ...emptySeller("completed", "found"), evidence: [evidence("seller", { title: "Policy", description: "d", sourceUrl: "https://example.com/p", verification: "verified" })] }; } },
      manufacturer: { name: "manufacturer", async run() { throw new Error("boom"); } },
    });
    const { investigation, done } = startInvestigation(caseId, a);
    await done;
    const json = await (await getResults(new Request("http://x"), ctx(investigation.investigationId))).json();
    expect(json.seller.status).toBe("completed");
    expect(json.evidence).toHaveLength(1);
    expect(json.manufacturer.status).toBe("failed");
    expect(json.status).toBe("completed_with_warnings");
    expect(json.isFinal).toBe(true);
    expect(JSON.stringify(json)).not.toContain("at "); // no stack traces
  });

  it("marks the investigation failed when every agent fails", async () => {
    const caseId = await makeCase();
    const { investigation, done } = startInvestigation(caseId); // real agents, TinyFish unconfigured
    await done;
    const inv = store.getInvestigation(investigation.investigationId)!;
    expect(inv.status).toBe("failed");
    expect(inv.seller.error?.code).toBe("TINYFISH_NOT_CONFIGURED");
    expect(inv.serviceCentre.status).toBe("not_applicable");
  });
});

describe("adaptive branching", () => {
  it("skips service-centre discovery without warranty evidence", async () => {
    const caseId = await makeCase();
    const a = agents();
    await startInvestigation(caseId, a).done;
    expect(a.calls).not.toContain("service_centre");
  });

  it("runs service-centre discovery when manufacturer evidence is potentially applicable", async () => {
    const caseId = await makeCase();
    const a = agents({
      manufacturer: { name: "manufacturer", async run() { return { ...emptyManufacturer("completed", "w"), evidence: [evidence("manufacturer", { title: "Warranty", description: "d", sourceUrl: "https://example.com/w", verification: "potentially_applicable" })] }; } },
    });
    const { investigation, done } = startInvestigation(caseId, a);
    await done;
    expect(a.calls).toContain("service_centre");
    expect(store.getInvestigation(investigation.investigationId)?.status).toBe("completed");
  });

  it("captures an orchestration crash as failed status with a safe error", async () => {
    const caseId = await makeCase();
    const a = agents({
      // Malformed agent output (no evidence array) breaks orchestration itself, not just the agent.
      seller: { name: "seller", async run() { return { status: "completed" } as never; } },
    });
    const { investigation, done } = startInvestigation(caseId, a);
    await done;
    const inv = store.getInvestigation(investigation.investigationId)!;
    expect(inv.status).toBe("failed");
    expect(inv.error?.code).toBe("AGENT_EXECUTION_FAILED");
    expect(store.getEvents(inv.investigationId).at(-1)?.type).toBe("complete");
  });
});

describe("GET /api/investigations/:id/events (SSE)", () => {
  it("404s for unknown id with JSON error", async () => {
    const res = await getEvents(new Request("http://x"), ctx("missing"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("INVESTIGATION_NOT_FOUND");
  });

  it("streams well-formed events, ends with `complete`, and closes", async () => {
    const caseId = await makeCase();
    const { investigation, done } = startInvestigation(caseId, agents());
    const res = await getEvents(new Request("http://x"), ctx(investigation.investigationId));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await done;
    const events = await readSse(res);
    expect(events.length).toBeGreaterThan(3);
    expect(events.map(e => e.id)).toEqual(events.map((_, i) => i + 1));
    for (const e of events) {
      expect(e.event).toBe(e.data.type);
      expect(e.data).toMatchObject({ investigationId: investigation.investigationId, seq: e.id });
      expect(typeof e.data.timestamp).toBe("string");
    }
    expect(events.at(-1)?.event).toBe("complete");
  });

  it("replays only events after Last-Event-ID", async () => {
    const caseId = await makeCase();
    const { investigation, done } = startInvestigation(caseId, agents());
    await done;
    const total = store.getEvents(investigation.investigationId).length;
    const res = await getEvents(new Request("http://x", { headers: { "last-event-id": String(total - 1) } }), ctx(investigation.investigationId));
    const events = await readSse(res);
    expect(events.map(e => e.id)).toEqual([total]);
  });
});

describe("POST /api/complaints", () => {
  it("validates input and 404s for unknown case/investigation", async () => {
    expect((await createComplaint(post({}))).status).toBe(400);
    expect((await createComplaint(post({ caseId: "x", investigationId: "y" }))).status).toBe(404);
    const caseId = await makeCase();
    const res = await createComplaint(post({ caseId, investigationId: "y" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("INVESTIGATION_NOT_FOUND");
  });

  it("returns a draft that is never sent and uses placeholders for unknowns", async () => {
    const caseId = await makeCase();
    const { investigation, done } = startInvestigation(caseId, agents());
    await done;
    const res = await createComplaint(post({ caseId, investigationId: investigation.investigationId }));
    expect(res.status).toBe(200);
    const draft = await res.json();
    expect(draft).toMatchObject({ requiresUserReview: true, sentAutomatically: false });
    expect(draft.body).toContain("[ADD ORDER ID / INVOICE NUMBER]");
    expect(draft.body).not.toMatch(/entitled|guarantee/i);
  });
});
