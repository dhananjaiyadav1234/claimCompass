import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = store.getInvestigation(id);
  if (!result) return NextResponse.json({ error: "INVESTIGATION_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(result);
}
