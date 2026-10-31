import { NextResponse } from "next/server";
import { CreateInvestigationSchema, type CreateInvestigationResponse } from "@/lib/contracts";
import { apiError } from "@/lib/http";
import { startInvestigation } from "@/lib/orchestrator";
import { store } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateInvestigationSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Request validation failed.", parsed.error.flatten());
  if (!store.getCase(parsed.data.caseId)) return apiError(404, "CASE_NOT_FOUND", "No case with that caseId.");

  const { investigation } = startInvestigation(parsed.data.caseId);
  const id = investigation.investigationId;
  const response: CreateInvestigationResponse = {
    investigationId: id,
    status: investigation.status,
    createdAt: investigation.createdAt,
    eventsUrl: `/api/investigations/${id}/events`,
    resultsUrl: `/api/investigations/${id}/results`,
  };
  return NextResponse.json(response, { status: 202 });
}
