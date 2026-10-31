/**
 * Structured output requested from TinyFish for the manufacturer warranty investigation, and the
 * Zod schema that validates it. As with the seller schema, the JSON Schema must not contain
 * `description` keys (TinyFish rejects them), so field semantics live in MANUFACTURER_FIELD_GUIDE.
 */
import { z } from "zod";
import { clean } from "./seller-schema";

export const WARRANTY_TOPICS = [
  "model_identification", "warranty_duration", "warranty_start", "regional_applicability", "coverage_scope", "exclusion",
  "additional_condition", "proof_of_purchase", "serial_registration", "claim_procedure", "inspection_service", "support_channel",
] as const;
const PAGE_TYPES = ["official_warranty", "official_support", "official_product", "other"] as const;
const APPLIES_TO = ["exact_model", "product_family", "generic", "other_model"] as const;
const START_EVENTS = ["purchase_date", "invoice_date", "delivery_date", "activation_date", "manufacture_date", "other", "unknown"] as const;

const text = (max: number) => z.string().transform(s => clean(s, max));
const httpUrl = z.string().url().max(2000).refine(u => /^https?:\/\//i.test(u), "must be http(s)");
const optionalUrl = z.string().max(2000).transform(s => s.trim()).refine(s => s === "" || /^https?:\/\/\S+$/i.test(s), "must be empty or http(s) URL");
const tri = z.enum(["yes", "no", "unknown"]);

export const WarrantyFindingSchema = z.object({
  topic: z.enum(WARRANTY_TOPICS),
  appliesTo: z.enum(APPLIES_TO),
  statement: text(600).refine(s => s.length > 0, "empty statement"),
  excerpt: text(800).refine(s => s.length >= 10, "excerpt too short"),
  sourceUrl: httpUrl,
  confidence: z.enum(["high", "medium", "low"]),
});

export const ManufacturerRawSchema = z.object({
  siteReachable: z.boolean(),
  blocked: z.boolean(),
  blockedDetail: text(300).default(""),
  manufacturerName: text(100).default(""),
  modelMatch: z.enum(["exact", "similar_only", "not_found"]),
  matchedModel: text(100).default(""),
  warrantyFound: z.boolean(),
  pagesVisited: z.array(z.object({ url: httpUrl, title: text(200), pageType: z.enum(PAGE_TYPES) })).max(15),
  findings: z.array(WarrantyFindingSchema).max(30),
  durationStated: z.boolean().default(false),
  durationValue: z.number().int().min(0).max(600).default(0),
  durationUnit: z.enum(["months", "years", "days", "unknown"]).default("unknown"),
  startEvent: z.enum(START_EVENTS).default("unknown"),
  startEventDetail: text(300).default(""),
  regionScope: z.enum(["country_specific", "regional", "international", "unknown"]).default("unknown"),
  coversCustomerCountry: tri.default("unknown"),
  internationalWarranty: tri.default("unknown"),
  coversDefects: tri.default("unknown"),
  proofOfPurchaseRequired: tri.default("unknown"),
  serialNumberRequired: tri.default("unknown"),
  registrationRequired: tri.default("unknown"),
  inspectionRequired: tri.default("unknown"),
  claimInitiationUrl: optionalUrl.default(""),
  supportRouteDescription: text(400).default(""),
  supportRouteUrl: optionalUrl.default(""),
  requiredDocuments: z.array(text(200)).max(15).default([]),
  exclusions: z.array(text(300)).max(20).default([]),
  additionalConditions: z.array(text(300)).max(15).default([]),
  limitations: z.array(text(300)).max(10).default([]),
});
export type ManufacturerRaw = z.infer<typeof ManufacturerRawSchema>;
export type WarrantyFinding = z.infer<typeof WarrantyFindingSchema>;

const str = { type: "string" };
const bool = { type: "boolean" };
const triJson = { type: "string", enum: ["yes", "no", "unknown"] };

export const MANUFACTURER_OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    siteReachable: bool, blocked: bool, blockedDetail: str, manufacturerName: str,
    modelMatch: { type: "string", enum: ["exact", "similar_only", "not_found"] },
    matchedModel: str, warrantyFound: bool,
    pagesVisited: { type: "array", items: { type: "object", properties: { url: str, title: str, pageType: { type: "string", enum: [...PAGE_TYPES] } }, required: ["url", "title", "pageType"] } },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string", enum: [...WARRANTY_TOPICS] },
          appliesTo: { type: "string", enum: [...APPLIES_TO] },
          statement: str, excerpt: str, sourceUrl: str,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["topic", "appliesTo", "statement", "excerpt", "sourceUrl", "confidence"],
      },
    },
    durationStated: bool, durationValue: { type: "integer" },
    durationUnit: { type: "string", enum: ["months", "years", "days", "unknown"] },
    startEvent: { type: "string", enum: [...START_EVENTS] }, startEventDetail: str,
    regionScope: { type: "string", enum: ["country_specific", "regional", "international", "unknown"] },
    coversCustomerCountry: triJson, internationalWarranty: triJson, coversDefects: triJson,
    proofOfPurchaseRequired: triJson, serialNumberRequired: triJson, registrationRequired: triJson, inspectionRequired: triJson,
    claimInitiationUrl: str, supportRouteDescription: str, supportRouteUrl: str,
    requiredDocuments: { type: "array", items: str }, exclusions: { type: "array", items: str },
    additionalConditions: { type: "array", items: str }, limitations: { type: "array", items: str },
  },
  required: ["siteReachable", "blocked", "modelMatch", "warrantyFound", "pagesVisited", "findings"],
};

export const MANUFACTURER_FIELD_GUIDE = [
  "Output fields:",
  "- siteReachable; blocked / blockedDetail (true if a CAPTCHA, login wall, bot check or access denial stopped you, and what); manufacturerName (the company that makes the product, as shown on its official site).",
  "- modelMatch: \"exact\" ONLY if an official page names the customer's exact model number; \"similar_only\" if you only found a similar/related model or a whole product line; \"not_found\" otherwise. matchedModel: the model name/number exactly as the official page shows it (empty if none). Never treat a similar model's terms as the customer's model.",
  "- warrantyFound: true ONLY if you opened an official page stating warranty terms.",
  "- pagesVisited: official pages you actually opened (exact url, title, pageType official_warranty|official_support|official_product|other).",
  "- findings: one entry per fact. topic is one of model_identification, warranty_duration, warranty_start, regional_applicability, coverage_scope, exclusion, additional_condition, proof_of_purchase, serial_registration, claim_procedure, inspection_service, support_channel. appliesTo says what the source page covers: exact_model (names the customer's model), product_family (covers a product line/category that includes it), generic (a general warranty for all the maker's products), other_model (a different model - not applicable). excerpt = text copied verbatim from the page; sourceUrl = exact URL of that page.",
  "- durationStated / durationValue / durationUnit: whether the terms state a warranty length, the number (0 if none) and unit (months|years|days|unknown). startEvent / startEventDetail: what starts the warranty (purchase_date|invoice_date|delivery_date|activation_date|manufacture_date|other|unknown).",
  "- regionScope: country_specific|regional|international|unknown. coversCustomerCountry / internationalWarranty / coversDefects (manufacturing defects covered): yes|no|unknown.",
  "- proofOfPurchaseRequired / serialNumberRequired / registrationRequired / inspectionRequired: yes|no|unknown.",
  "- claimInitiationUrl: official URL for starting a warranty claim or finding repair service (else empty string). supportRouteDescription / supportRouteUrl: official support or escalation route.",
  "- requiredDocuments, exclusions, additionalConditions: lists taken from the official terms. limitations: anything you could not check. Use empty strings / empty lists / \"unknown\" when something is not stated; never guess.",
].join("\n");
