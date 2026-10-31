import { z } from "zod";

export const CaseInputSchema = z.object({
  productName: z.string().min(1),
  model: z.string().optional().default(""),
  seller: z.string().min(1),
  purchaseDate: z.string().min(1), // ISO date: YYYY-MM-DD
  purchasePrice: z.number().nonnegative(),
  currency: z.string().default("INR"),
  issueDescription: z.string().min(5),
  city: z.string().min(1),
  state: z.string().optional().default(""),
  invoiceUrl: z.string().url().optional(),
});

export type CaseInput = z.infer<typeof CaseInputSchema>;

export type AgentName = "seller" | "manufacturer" | "service_centre";
export type AgentStatus = "queued" | "running" | "completed" | "partial" | "failed";
export type VerificationStatus =
  | "verified"
  | "potentially_applicable"
  | "unverified"
  | "not_applicable"
  | "unknown";

export interface EvidenceFinding {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
  evidenceExcerpt?: string;
  verification: VerificationStatus;
  retrievedAt: string;
}

export interface AgentResult {
  agent: AgentName;
  status: AgentStatus;
  summary: string;
  findings: EvidenceFinding[];
  error?: { code: string; message: string };
}

export interface Recommendation {
  action: string;
  reasoning: string;
  nextSteps: string[];
  confidence: "high" | "medium" | "low" | "undetermined";
}

export interface FinancialAssessment {
  purchaseValue: number;
  confirmedRecovery: number | null;
  estimatedRecovery: number | null;
  currency: string;
  note: string;
}

export interface InvestigationResult {
  investigationId: string;
  caseId: string;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  agents: AgentResult[];
  recommendation?: Recommendation;
  missingDocuments: string[];
  financialAssessment: FinancialAssessment;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationEvent {
  id: string;
  investigationId: string;
  timestamp: string;
  type: "status" | "agent" | "finding" | "warning" | "complete";
  agent?: AgentName;
  message: string;
  data?: Record<string, unknown>;
}

export const CreateInvestigationSchema = z.object({
  caseId: z.string().min(1),
});
