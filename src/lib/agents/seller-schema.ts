/**
 * Structured output requested from TinyFish for the seller investigation, and the Zod schema
 * used to validate it. Free-text fields are cleaned and truncated (not rejected); structure,
 * enums and URLs are strict. Nullable values use "" / "unknown" because TinyFish's
 * structured-output subset is documented only for plain JSON-Schema types.
 */
import { z } from "zod";

const FINDING_TOPICS = [
  "defective_return", "refund", "replacement", "time_limit", "eligibility_condition", "exclusion",
  "category_restriction", "seller_type", "claim_initiation", "required_documents", "support_route",
] as const;
const PAGE_TYPES = ["official_policy", "official_help", "official_account", "other"] as const;

/** Strip control characters and collapse whitespace; truncate to max. */
export function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
const text = (max: number) => z.string().transform(s => clean(s, max));
const httpUrl = z.string().url().max(2000).refine(u => /^https?:\/\//i.test(u), "must be http(s)");
const optionalUrl = z.string().max(2000).transform(s => s.trim()).refine(s => s === "" || /^https?:\/\/\S+$/i.test(s), "must be empty or http(s) URL");
const tri = z.enum(["yes", "no", "unknown"]);

export const SellerFindingSchema = z.object({
  topic: z.enum(FINDING_TOPICS),
  statement: text(600).refine(s => s.length > 0, "empty statement"),
  excerpt: text(800).refine(s => s.length >= 10, "excerpt too short"),
  sourceUrl: httpUrl,
  confidence: z.enum(["high", "medium", "low"]),
});

export const SellerRawSchema = z.object({
  siteReachable: z.boolean(),
  blocked: z.boolean(),
  blockedDetail: text(300).default(""),
  policyFound: z.boolean(),
  officialSiteName: text(100).default(""),
  pagesVisited: z.array(z.object({ url: httpUrl, title: text(200), pageType: z.enum(PAGE_TYPES) })).max(15),
  findings: z.array(SellerFindingSchema).max(30),
  windowDaysStated: z.boolean(),
  windowDays: z.number().int().min(0).max(3650),
  windowSourceUrl: optionalUrl.default(""),
  policyDistinguishesSellerTypes: tri,
  thirdPartySellerPolicy: text(500).default(""),
  distinguishesDefectiveFromChangeOfMind: tri,
  categoryRestriction: tri,
  categoryRestrictionDetail: text(500).default(""),
  claimInitiationUrl: optionalUrl.default(""),
  supportRouteDescription: text(400).default(""),
  supportRouteUrl: optionalUrl.default(""),
  requiredDocuments: z.array(text(200)).max(15),
  exclusions: z.array(text(300)).max(15),
  limitations: z.array(text(300)).max(10),
});
export type SellerRaw = z.infer<typeof SellerRawSchema>;
export type SellerFinding = z.infer<typeof SellerFindingSchema>;

/**
 * TinyFish's structured-output subset rejects `description` keys (verified live), so field
 * semantics are given to the agent in the goal text (SELLER_FIELD_GUIDE) instead.
 */
const str = { type: "string" };
const bool = { type: "boolean" };
const triJson = { type: "string", enum: ["yes", "no", "unknown"] };

/** JSON Schema sent to TinyFish as `output_schema` (top-level object, plain types only). */
export const SELLER_OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    siteReachable: bool,
    blocked: bool,
    blockedDetail: str,
    policyFound: bool,
    officialSiteName: str,
    pagesVisited: {
      type: "array",
      items: { type: "object", properties: { url: str, title: str, pageType: { type: "string", enum: [...PAGE_TYPES] } }, required: ["url", "title", "pageType"] },
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string", enum: [...FINDING_TOPICS] },
          statement: str, excerpt: str, sourceUrl: str,
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["topic", "statement", "excerpt", "sourceUrl", "confidence"],
      },
    },
    windowDaysStated: bool,
    windowDays: { type: "integer" },
    windowSourceUrl: str,
    policyDistinguishesSellerTypes: triJson,
    thirdPartySellerPolicy: str,
    distinguishesDefectiveFromChangeOfMind: triJson,
    categoryRestriction: triJson,
    categoryRestrictionDetail: str,
    claimInitiationUrl: str,
    supportRouteDescription: str,
    supportRouteUrl: str,
    requiredDocuments: { type: "array", items: str },
    exclusions: { type: "array", items: str },
    limitations: { type: "array", items: str },
  },
  required: ["siteReachable", "blocked", "policyFound", "pagesVisited", "findings", "windowDaysStated", "windowDays", "policyDistinguishesSellerTypes", "distinguishesDefectiveFromChangeOfMind", "categoryRestriction", "requiredDocuments", "exclusions", "limitations"],
};

export const SELLER_FIELD_GUIDE = [
  "Output fields:",
  "- siteReachable: true if you could open the seller's official website.",
  "- blocked / blockedDetail: blocked=true if a CAPTCHA, login wall, bot check or access denial stopped you; blockedDetail says what (else empty string).",
  "- policyFound: true ONLY if you actually opened an official page stating return/refund/replacement rules.",
  "- officialSiteName: the seller/marketplace whose official site you used.",
  "- pagesVisited: official pages you actually opened (exact url, title, pageType official_policy|official_help|official_account|other).",
  "- findings: one entry per rule. topic is one of defective_return, refund, replacement, time_limit, eligibility_condition, exclusion, category_restriction, seller_type, claim_initiation, required_documents, support_route. excerpt = text copied verbatim from the page; sourceUrl = exact URL of that page.",
  "- windowDaysStated / windowDays / windowSourceUrl: whether the policy states a numeric day limit for defective/damaged returns or replacements, that number (0 if none), and the page stating it.",
  "- policyDistinguishesSellerTypes / thirdPartySellerPolicy: whether rules differ for items sold by the marketplace itself vs third-party sellers (yes/no/unknown), and how.",
  "- distinguishesDefectiveFromChangeOfMind: yes/no/unknown. categoryRestriction / categoryRestrictionDetail: whether this product's category has return restrictions.",
  "- claimInitiationUrl: official URL where a customer starts a return/replacement/claim (else empty string). supportRouteDescription / supportRouteUrl: official support or escalation route.",
  "- requiredDocuments, exclusions: lists taken from the policy. limitations: anything you could not check. Use empty strings / empty lists / \"unknown\" when something is not stated; never guess.",
].join("\n");
