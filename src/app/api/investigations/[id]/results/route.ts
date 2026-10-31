import { NextResponse } from "next/server";
import { TERMINAL_INVESTIGATION_STATUSES, type InvestigationResultsResponse } from "@/lib/contracts";
import { apiError } from "@/lib/http";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const inv = store.getInvestigation(id);
  if (!inv) return apiError(404, "INVESTIGATION_NOT_FOUND", "No investigation with that id.");
  const body: InvestigationResultsResponse = {
    ...inv,
    evidence: [...inv.seller.evidence, ...inv.manufacturer.evidence, ...inv.serviceCentre.evidence],
    isFinal: TERMINAL_INVESTIGATION_STATUSES.includes(inv.status),
  };
  return NextResponse.json(body);
}
