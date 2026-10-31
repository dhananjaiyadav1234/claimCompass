import type { ManufacturerDetails, Tri, WarrantyStartEvent } from "../contracts";

export type WarrantyAssessment = ManufacturerDetails["assessment"];
type Duration = { value: number; unit: "months" | "years" | "days" };

export interface WarrantyAssessInput {
  /** Official-source evidence about warranty terms exists at all. */
  warrantyEvidenceOfficial: boolean;
  exactModelVerified: boolean;
  /** Only a duration whose number and unit appear in an official excerpt. */
  duration: Duration | null;
  /** Official excerpts disagree about the length. */
  durationConflict: boolean;
  termsApplyTo: ManufacturerDetails["warrantyTerms"]["termsApplyTo"];
  /** "unknown" unless backed by an official warranty_start finding. */
  startEvent: WarrantyStartEvent;
  regionalApplicability: ManufacturerDetails["warrantyTerms"]["regionalApplicability"];
  coversDefects: Tri;
  purchaseDate: string; // YYYY-MM-DD
  now: Date;
}

const DAY = 86_400_000;

export function addPeriod(startIso: string, d: Duration): Date {
  const date = new Date(`${startIso}T00:00:00Z`);
  if (d.unit === "days") date.setUTCDate(date.getUTCDate() + d.value);
  else date.setUTCMonth(date.getUTCMonth() + (d.unit === "years" ? d.value * 12 : d.value));
  return date;
}

export function daysSince(dateIso: string, now: Date): number {
  const start = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / DAY));
}

const UNIT_STEM = { months: /month/i, years: /year/i, days: /day/i } as const;
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** All warranty lengths (normalised to months, days as /30) that an excerpt states, e.g. "12 months", "one (1) year". */
export function periodsInExcerpt(excerpt: string): Array<{ value: number; unit: "months" | "years" | "days" }> {
  const out: Array<{ value: number; unit: "months" | "years" | "days" }> = [];
  const re = /(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:\(\d{1,3}\)\s*)?-?\s*(month|year|day)s?/gi;
  for (const m of excerpt.matchAll(re)) {
    const raw = m[1].toLowerCase();
    out.push({ value: /^\d/.test(raw) ? Number(raw) : WORDS[raw], unit: `${m[2].toLowerCase()}s` as "months" | "years" | "days" });
  }
  return out;
}

export const toMonths = (d: Duration) => (d.unit === "years" ? d.value * 12 : d.unit === "months" ? d.value : d.value / 30);

/** True if the excerpt states exactly this number and unit. */
export function excerptStatesDuration(excerpt: string, d: Duration): boolean {
  return UNIT_STEM[d.unit].test(excerpt) && periodsInExcerpt(excerpt).some(p => p.value === d.value && p.unit === d.unit);
}

/**
 * Conservative, deterministic warranty assessment. It can never return confirmed coverage:
 * `customerCoverageConfirmed` is always false (serial/registration records are not accessible).
 * A missing duration is never treated as zero, an unknown start event is never assumed to be
 * the purchase date, and terms of similar or generic scope are never applied to the exact model.
 */
export function assessWarranty(i: WarrantyAssessInput): WarrantyAssessment {
  const daysSincePurchase = daysSince(i.purchaseDate, i.now);
  const base = { customerCoverageConfirmed: false as const, estimatedExpiry: null as string | null, daysSincePurchase };
  const caveats = [
    "Only the manufacturer can confirm coverage for a specific unit; it may check the serial number, registration and proof of purchase.",
    "The manufacturer decides whether the reported fault counts as a covered defect.",
  ];
  const cd = (explanation: string): WarrantyAssessment => ({ ...base, state: "cannot_determine", explanation, caveats });

  if (!i.warrantyEvidenceOfficial) {
    return { ...base, state: "warranty_not_verified", caveats, explanation: "No warranty terms were verified from an official manufacturer source. This is not a finding that the product has no warranty or is out of warranty." };
  }
  if (!i.exactModelVerified) return cd("Warranty information was found, but the customer's exact model was not verified on an official page, so terms for similar or general products are not applied to it.");
  if (i.durationConflict) return cd("Official sources give conflicting warranty lengths for this model.");
  if (!i.duration) return cd("A warranty page was found, but a warranty length stated in an official excerpt was not verified.");
  if (i.termsApplyTo !== "exact_model") return cd("The verified warranty length comes from general or product-family terms, not terms specific to this exact model.");
  if (Number.isNaN(Date.parse(i.purchaseDate))) return cd("The purchase date is missing or invalid, so the warranty period cannot be compared.");
  if (i.startEvent === "unknown") return cd("The official terms did not clearly state what starts the warranty, so the purchase date is not assumed to be the start.");
  if (i.startEvent !== "purchase_date" && i.startEvent !== "invoice_date") return cd(`The warranty starts from the ${i.startEvent.replace("_", " ")}, which is not available, so the period cannot be compared with the purchase date.`);
  if (i.regionalApplicability !== "covers_customer_country") {
    return cd(i.regionalApplicability === "other_regions_only" ? "The verified warranty terms apply to other regions, not the customer's country." : "It is not established that these warranty terms apply in the customer's country.");
  }
  if (i.coversDefects === "no") return cd("The official terms do not appear to cover defects of this kind; the manufacturer should be asked.");

  const expiry = addPeriod(i.purchaseDate, i.duration);
  const estimatedExpiry = expiry.toISOString().slice(0, 10);
  const startNote = i.startEvent === "invoice_date" ? " (the invoice date is assumed to equal the purchase date)" : "";
  if (i.now.getTime() > expiry.getTime() + DAY - 1) {
    return { ...base, state: "appears_expired", estimatedExpiry, caveats, explanation: `Counting ${i.duration.value} ${i.duration.unit} from the purchase date${startNote}, the warranty would have ended around ${estimatedExpiry}. The manufacturer's own records and any extended or statutory cover are not known.` };
  }
  return { ...base, state: "potentially_covered", estimatedExpiry, caveats, explanation: `Counting ${i.duration.value} ${i.duration.unit} from the purchase date${startNote}, the warranty would run until about ${estimatedExpiry}. This does not confirm that this unit is covered or that the fault is accepted as a defect.` };
}
