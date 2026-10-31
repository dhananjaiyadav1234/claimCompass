import type { Case, ManufacturerWarrantyResult, MoneySummary, ResolutionRecommendation, SellerInvestigationResult } from "./contracts";

const supportive = (v: string) => v === "verified" || v === "potentially_applicable";

/**
 * Deterministic rules over evidence-backed findings (Phase 7 will extend this).
 * Branching depends only on what the agents actually found.
 */
export function assessResolution(
  input: Case,
  seller: SellerInvestigationResult,
  manufacturer: ManufacturerWarrantyResult,
): { recommendation: ResolutionRecommendation; shouldFindServiceCentre: boolean } {
  const warrantyPotential =
    manufacturer.potentialCoverage === "potentially_applicable" ||
    manufacturer.potentialCoverage === "verified" ||
    manufacturer.evidence.some(e => supportive(e.verification));
  const sellerPotential = seller.evidence.some(e => supportive(e.verification));

  const missingInformation = [...seller.missingInformation, ...manufacturer.missingInformation];
  if (!input.modelNumber) missingInformation.push("Exact model number");
  const requiredDocuments = ["Purchase invoice", "Product serial number", "Photographs or a short video showing the defect"];
  const caveats = ["Eligibility is never guaranteed; confirm with the seller or manufacturer."];
  const evidenceIds = [...seller.evidence, ...manufacturer.evidence].map(e => e.id);

  let recommendation: ResolutionRecommendation;
  if (warrantyPotential) {
    recommendation = {
      primaryRoute: "Manufacturer warranty claim via an authorised service centre",
      alternativeRoutes: sellerPotential ? ["Seller return/replacement route"] : [],
      reasoning: "Manufacturer evidence suggests warranty coverage may be relevant. Coverage is not confirmed for this unit.",
      requiredDocuments, missingInformation, caveats, evidenceIds,
      nextSteps: ["Locate an authorised service centre", "Keep the invoice and serial number ready", "Confirm coverage with the manufacturer before visiting"],
      confidence: "medium",
    };
  } else if (sellerPotential) {
    recommendation = {
      primaryRoute: "Seller support route",
      alternativeRoutes: [],
      reasoning: "Seller evidence points to a potentially relevant route. Review its exact conditions first.",
      requiredDocuments, missingInformation, caveats, evidenceIds,
      nextSteps: ["Open the official seller support route", "Keep the invoice and defect evidence ready"],
      confidence: "low",
    };
  } else {
    recommendation = {
      primaryRoute: "Verify the official support route",
      alternativeRoutes: ["Contact the seller's official support", "Contact the manufacturer's official support"],
      reasoning: "Available evidence does not establish return or warranty eligibility yet.",
      requiredDocuments, missingInformation, caveats: [...caveats, "No verified findings were available when this recommendation was produced."], evidenceIds,
      nextSteps: ["Confirm purchase date and serial number", "Contact the seller or manufacturer through its official channel"],
      confidence: "undetermined",
    };
  }
  return { recommendation, shouldFindServiceCentre: warrantyPotential };
}

export function buildMoney(input: Pick<Case, "purchasePrice" | "currency">): MoneySummary {
  return {
    currency: input.currency,
    purchaseValueUnderInvestigation: input.purchasePrice,
    confirmedRecovery: null,
    estimatedRecovery: null,
    estimateBasis: null,
    confidence: "undetermined",
    explanation: "Purchase value under investigation. No recovery amount has been confirmed or estimated; this is not a guaranteed refund.",
  };
}
