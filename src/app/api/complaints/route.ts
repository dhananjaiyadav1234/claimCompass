import { NextResponse } from "next/server";
import { CreateComplaintSchema, type ComplaintDraft } from "@/lib/contracts";
import { apiError } from "@/lib/http";
import { store } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateComplaintSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Request validation failed.", parsed.error.flatten());

  const input = store.getCase(parsed.data.caseId);
  if (!input) return apiError(404, "CASE_NOT_FOUND", "No case with that caseId.");
  const inv = store.getInvestigation(parsed.data.investigationId);
  if (!inv || inv.caseId !== input.caseId) return apiError(404, "INVESTIGATION_NOT_FOUND", "No investigation with that id for this case.");

  const evidence = [...inv.seller.evidence, ...inv.manufacturer.evidence, ...inv.serviceCentre.evidence];
  const product = [input.productName, input.modelNumber].filter(Boolean).join(" ");
  const body_ = [
    "Hello,",
    "",
    `I purchased ${product} from ${input.seller} on ${input.purchaseDate} for ${input.currency} ${input.purchasePrice}. Order/invoice reference: [ADD ORDER ID / INVOICE NUMBER].`,
    `The issue I am experiencing: ${input.issueDescription}`,
    "",
    "I would like to understand which resolution (return, replacement, repair or warranty service) applies under your official policy, and what documents you need from me.",
    ...(evidence.length ? ["", "Policy information I reviewed:", ...evidence.map(e => `- ${e.title} (${e.sourceUrl})`)] : []),
    "",
    "Thank you,",
    "[YOUR NAME]  [YOUR CONTACT DETAILS]",
  ].join("\n");

  const draft: ComplaintDraft = {
    subject: `Request for assistance: ${product}`,
    body: body_,
    evidenceUrls: [...new Set(evidence.map(e => e.sourceUrl))],
    requiresUserReview: true,
    sentAutomatically: false,
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(draft);
}
