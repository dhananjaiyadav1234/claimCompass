import { NextResponse } from "next/server";
import { CreateInvestigationSchema } from "@/lib/contracts";
import { startInvestigation } from "@/lib/orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateInvestigationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  try {
    const investigationId = startInvestigation(parsed.data.caseId);
    return NextResponse.json({ investigationId }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "START_FAILED";
    return NextResponse.json({ error: message }, { status: message === "CASE_NOT_FOUND" ? 404 : 500 });
  }
}
