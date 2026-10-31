import { NextResponse } from "next/server";
import type { ApiErrorCode, ApiErrorResponse } from "./contracts";

export function apiError(status: number, code: ApiErrorCode, message: string, details?: unknown) {
  const body: ApiErrorResponse = { error: { code, message, ...(details !== undefined ? { details } : {}) } };
  return NextResponse.json(body, { status });
}
