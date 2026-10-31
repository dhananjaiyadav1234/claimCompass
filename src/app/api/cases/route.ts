import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CaseInputSchema, type Case } from "@/lib/contracts";
import { apiError } from "@/lib/http";
import { store } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CaseInputSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Case validation failed.", parsed.error.flatten());
  const created: Case = { ...parsed.data, caseId: randomUUID(), createdAt: new Date().toISOString() };
  store.saveCase(created);
  return NextResponse.json({ caseId: created.caseId, case: created }, { status: 201 });
}
