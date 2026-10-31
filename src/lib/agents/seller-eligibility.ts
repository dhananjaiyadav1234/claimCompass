import type { SellerDetails, Tri } from "../contracts";

export interface EligibilityInput {
  policyLocated: boolean;
  /** At least one policy finding on an official domain. */
  policyEvidenceOfficial: boolean;
  /** A numeric window with an official time_limit finding behind it. */
  windowDays: number | null;
  policyDistinguishesSellerTypes: Tri;
  categoryRestriction: Tri;
  eligibilityConditionCount: number;
  purchaseDate: string; // YYYY-MM-DD
  now: Date;
}

export function daysBetween(purchaseDate: string, now: Date): number {
  const start = Date.parse(`${purchaseDate}T00:00:00Z`);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/**
 * Conservative, deterministic assessment. It never returns confirmed eligibility:
 * `sellerConfirmed` is always false because only the seller can confirm a specific order.
 */
export function assessEligibility(i: EligibilityInput): SellerDetails["eligibility"] {
  const daysSincePurchase = daysBetween(i.purchaseDate, i.now);
  const base = {
    policyExists: (i.policyLocated ? "yes" : "unknown") as Tri,
    policyAppliesToCategory: (i.policyLocated && i.categoryRestriction === "no" ? "yes" : "unknown") as Tri,
    sellerConfirmed: false as const,
    policyWindowDays: i.windowDays,
    daysSincePurchase,
  };
  const withNote = " Only the seller can confirm eligibility for this specific order, and the window may be counted from delivery rather than the purchase date.";

  if (!i.policyLocated || !i.policyEvidenceOfficial) {
    return { ...base, customerAppearsToSatisfy: "unknown", assessment: "policy_not_verified", explanation: "No seller policy was verified from an official source, so eligibility cannot be assessed. This is not a finding that the product is ineligible." };
  }
  if (i.policyDistinguishesSellerTypes === "yes") {
    return { ...base, customerAppearsToSatisfy: "unknown", assessment: "cannot_determine", explanation: "The policy differs for marketplace-sold and third-party-sold items, and who sold this order is not verified." + withNote };
  }
  if (i.categoryRestriction === "yes") {
    return { ...base, customerAppearsToSatisfy: "unknown", assessment: "cannot_determine", explanation: "The policy states a category restriction that may affect this product; applicability is not verified." + withNote };
  }
  if (i.windowDays === null) {
    return { ...base, customerAppearsToSatisfy: "unknown", assessment: "cannot_determine", explanation: "A policy was found but no numeric time limit for defective products was verified." + withNote };
  }
  if (daysSincePurchase > i.windowDays) {
    return { ...base, customerAppearsToSatisfy: "no", assessment: "appears_outside_window", explanation: `The purchase was ${daysSincePurchase} days ago and the stated window is ${i.windowDays} days, so this route may be closed. Other routes (e.g. the manufacturer warranty) are not ruled out.` + withNote };
  }
  return {
    ...base,
    customerAppearsToSatisfy: i.eligibilityConditionCount === 0 ? "yes" : "unknown",
    assessment: "appears_within_window",
    explanation: `The purchase was ${daysSincePurchase} days ago, inside the stated ${i.windowDays}-day window. Other policy conditions${i.eligibilityConditionCount ? " (listed in the findings)" : ""} still need to be met.` + withNote,
  };
}
