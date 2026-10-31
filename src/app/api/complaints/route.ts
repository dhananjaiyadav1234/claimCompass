import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";

const Schema = z.object({ caseId: z.string().min(1), investigationId: z.string().min(1) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  const input = store.getCase(parsed.data.caseId);
  const result = store.getInvestigation(parsed.data.investigationId);
  if (!input || !result || result.caseId !== parsed.data.caseId) return NextResponse.json({ error: "CASE_OR_INVESTIGATION_NOT_FOUND" }, { status: 404 });

  const evidence = result.agents.flatMap(a => a.findings);
  const draft = [
    `Subject: Request for assistance regarding ${input.productName} ${input.model}`.trim(),
    "",
    `I purchased ${input.productName} ${input.model} from ${input.seller} on ${input.purchaseDate} for ${input.currency} ${input.purchasePrice}.`,
    `The issue I am experiencing is: ${input.issueDescription}`,
    "",
    "I request that you review this issue and advise the applicable return, replacement, repair or warranty resolution under your official policy.",
    "",
    "Evidence reviewed:",
    ...evidence.map(f => `- ${f.title}: ${f.description} (${f.sourceUrl})`),
    "",
    "Please confirm the applicable process and any documents required.",
  ].join("\n");

  return NextResponse.json({ draft, requiresUserReview: true, evidenceCount: evidence.length });
}
