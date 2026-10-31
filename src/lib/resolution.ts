import type { AgentResult, CaseInput, Recommendation } from "./contracts";

export function assessResolution(
  input: CaseInput,
  seller: AgentResult,
  manufacturer: AgentResult,
): { recommendation: Recommendation; missingDocuments: string[]; shouldFindServiceCentre: boolean } {
  const text = [...seller.findings, ...manufacturer.findings]
    .map(f => `${f.title} ${f.description} ${f.evidenceExcerpt ?? ""}`.toLowerCase())
    .join(" ");

  const warrantyPotential =
    manufacturer.findings.some(f => f.verification === "potentially_applicable" || f.verification === "verified") ||
    /warranty.*(valid|applicable|covered)|within.*warranty/i.test(text);

  const sellerRoutePotential =
    seller.findings.some(f => f.verification === "potentially_applicable" || f.verification === "verified");

  const shouldFindServiceCentre = warrantyPotential;

  const recommendation: Recommendation = warrantyPotential
    ? {
        action: "Investigate the manufacturer's warranty route",
        reasoning: "The manufacturer investigation contains evidence suggesting warranty coverage may be relevant. Coverage is not guaranteed; confirm the invoice, serial number, region and exclusions.",
        nextSteps: ["Locate an authorised service centre", "Keep the purchase invoice and serial number ready", "Confirm coverage with the manufacturer before visiting"],
        confidence: "medium",
      }
    : sellerRoutePotential
      ? {
          action: "Contact the seller through its official support route",
          reasoning: "The seller investigation found a potentially relevant resolution route. Review its exact conditions before relying on eligibility.",
          nextSteps: ["Open the official seller support route", "Keep the invoice and defect evidence ready"],
          confidence: "low",
        }
      : {
          action: "Verify the official support route before choosing a claim path",
          reasoning: "The available evidence does not establish return or warranty eligibility yet.",
          nextSteps: ["Confirm purchase date and serial number", "Contact the seller or manufacturer through its official channel"],
          confidence: "undetermined",
        };

  const missingDocuments = ["Purchase invoice", "Product serial number"];
  if (input.issueDescription) missingDocuments.push("Photographs or a short video showing the defect");
  return { recommendation, missingDocuments, shouldFindServiceCentre };
}
