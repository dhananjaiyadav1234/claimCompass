import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CaseInputSchema } from "@/lib/contracts";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CaseInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CASE", details: parsed.error.flatten() }, { status: 400 });
  const caseId = randomUUID();
  store.saveCase(caseId, parsed.data);
  return NextResponse.json({ caseId, case: parsed.data }, { status: 201 });
}
