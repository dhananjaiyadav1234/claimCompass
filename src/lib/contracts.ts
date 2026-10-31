/**
 * Canonical API contract for ClaimCompass. Every route, agent and the frontend
 * should import types from here. Documented in docs/API_CONTRACT.md.
 */
import { z } from "zod";

// ---------- Enums ----------

export const INVESTIGATION_STATUSES = ["queued", "running", "completed", "completed_with_warnings", "failed"] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const AGENT_STATUSES = ["pending", "running", "completed", "partial", "not_applicable", "blocked", "failed"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type AgentName = "seller" | "manufacturer" | "service_centre";

export type VerificationStatus =
  | "verified"
  | "potentially_applicable"
  | "unverified"
  | "not_applicable"
  | "unknown";

export const TERMINAL_INVESTIGATION_STATUSES: readonly InvestigationStatus[] = ["completed", "completed_with_warnings", "failed"];

// ---------- Case ----------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(v => !Number.isNaN(Date.parse(v)), "Not a valid date")
  .refine(v => Date.parse(v) <= Date.now() + 24 * 3600 * 1000, "Purchase date cannot be in the future");

export const CaseInputSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  modelNumber: z.string().trim().max(100).optional(),
  seller: z.string().trim().min(1).max(100),
  purchaseDate: isoDate,
  purchasePrice: z.number().finite().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO code").default("INR"),
  issueDescription: z.string().trim().min(5).max(2000),
  location: z.object({
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().max(100).optional(),
    country: z.string().trim().min(1).max(100).default("India"),
  }),
});

export type CaseInput = z.infer<typeof CaseInputSchema>;

export interface Case extends CaseInput {
  caseId: string;
  createdAt: string;
}

export const CreateInvestigationSchema = z.object({ caseId: z.string().min(1) });
export const CreateComplaintSchema = z.object({
  caseId: z.string().min(1),
  investigationId: z.string().min(1),
});

// ---------- Evidence & agent results ----------

export interface Evidence {
  id: string;
  agent: AgentName;
  title: string;
  description: string;
  sourceUrl: string;
  sourceTitle?: string;
  excerpt?: string;
  verification: VerificationStatus;
  retrievedAt: string;
}

export interface AgentError {
  code: string;
  message: string;
}

export interface AgentResult {
  agent: AgentName;
  status: AgentStatus;
  summary: string;
  evidence: Evidence[];
  missingInformation: string[];
  limitations: string[];
  error?: AgentError;
  investigatedAt?: string;
}

export interface SellerInvestigationResult extends AgentResult {
  agent: "seller";
  policyCategory?: string;
  applicableConditions: string[];
  possibleRoutes: string[];
}

export interface ManufacturerWarrantyResult extends AgentResult {
  agent: "manufacturer";
  manufacturer?: string;
  matchedModel?: string;
  warrantyDuration?: string;
  warrantyStartRule?: string;
  potentialCoverage?: VerificationStatus;
  exclusions: string[];
  requiredDocuments: string[];
  claimSteps: string[];
  officialSupportPath?: string;
}

export interface ServiceCentre {
  name: string;
  address?: string;
  phone?: string;
  openingHours?: string;
  serviceType?: string;
  sourceUrl: string;
}

export interface ServiceCentreResult extends AgentResult {
  agent: "service_centre";
  manufacturer?: string;
  searchedLocation?: string;
  locatorUrl?: string;
  centres: ServiceCentre[];
  fallbackSupportPath?: string;
}

// ---------- Resolution & money ----------

export type Confidence = "high" | "medium" | "low" | "undetermined";

export interface ResolutionRecommendation {
  primaryRoute: string;
  alternativeRoutes: string[];
  reasoning: string;
  requiredDocuments: string[];
  missingInformation: string[];
  nextSteps: string[];
  caveats: string[];
  confidence: Confidence;
  evidenceIds: string[];
}

export interface MoneySummary {
  currency: string;
  /** The purchase price. NOT a recovery amount. */
  purchaseValueUnderInvestigation: number;
  /** null = unknown / not confirmed by any authoritative source. */
  confirmedRecovery: number | null;
  /** null = no estimate. When set, estimateBasis must explain it. */
  estimatedRecovery: number | null;
  estimateBasis: string | null;
  confidence: Confidence;
  explanation: string;
}

// ---------- Investigation ----------

export interface Investigation {
  investigationId: string;
  caseId: string;
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  seller: SellerInvestigationResult;
  manufacturer: ManufacturerWarrantyResult;
  serviceCentre: ServiceCentreResult;
  resolution: ResolutionRecommendation | null;
  money: MoneySummary;
  /** Set only when the orchestration itself crashed (not when an agent failed). */
  error?: AgentError;
}

/** Response shape of GET /api/investigations/:id/results */
export interface InvestigationResultsResponse extends Investigation {
  /** Flattened evidence from all agents. */
  evidence: Evidence[];
  isFinal: boolean;
}

export interface CreateInvestigationResponse {
  investigationId: string;
  status: InvestigationStatus;
  createdAt: string;
  eventsUrl: string;
  resultsUrl: string;
}

// ---------- Events ----------

export const EVENT_TYPES = ["status", "agent", "finding", "warning", "complete"] as const;
export type InvestigationEventType = (typeof EVENT_TYPES)[number];

export interface InvestigationEvent {
  /** Monotonic per-investigation sequence number, starting at 1. Also the SSE `id:`. */
  seq: number;
  investigationId: string;
  timestamp: string;
  type: InvestigationEventType;
  agent?: AgentName;
  message: string;
  data?: Record<string, unknown>;
}

// ---------- Complaint ----------

export interface ComplaintDraft {
  subject: string;
  body: string;
  evidenceUrls: string[];
  /** Always true: the user must review and send this themselves. */
  requiresUserReview: true;
  /** Always false: ClaimCompass never sends complaints. */
  sentAutomatically: false;
  generatedAt: string;
}

// ---------- Errors ----------

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "CASE_NOT_FOUND"
  | "INVESTIGATION_NOT_FOUND"
  | "INTERNAL_ERROR";

export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}
