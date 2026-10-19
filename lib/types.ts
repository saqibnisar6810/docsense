import type { FieldKey } from "@/lib/fields";

/** Position of a value on a page, as fractions of the page size (0–1). */
export type Box = { page: number; x: number; y: number; w: number; h: number };

export type FieldValue = {
  value: string | number | null;
  confidence: number;
  /** Where the value was found on the document (text-layer PDFs only). */
  box?: Box | null;
  /** model = straight from the AI, edited = changed by a reviewer. */
  source: "model" | "edited";
  /** Why the confidence was lowered, shown on hover. */
  note?: string;
};

export type Fields = Record<FieldKey, FieldValue>;

export type LineItem = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
};

export type Check = {
  id: "lines_sum" | "line_math" | "tax_math" | "total_math" | "dates" | "duplicate" | "required";
  label: string;
  ok: boolean;
  detail: string;
  fields: FieldKey[];
};

export type DocStatus = "processing" | "needs_review" | "ready" | "approved" | "failed";

export type PageImage = { path: string; width: number; height: number };

export type DocumentRecord = {
  id: string;
  workspaceId: string;
  fileName: string;
  mime: string;
  /** Storage path of the original upload. "public:" paths are bundled samples. */
  filePath: string;
  pages: PageImage[];
  isSample: boolean;
  status: DocStatus;
  documentType: string | null;
  method: "text" | "vision" | null;
  model: string | null;
  durationMs: number | null;
  fields: Fields | null;
  lineItems: LineItem[];
  checks: Check[];
  notes: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
};

export type EventKind = "uploaded" | "extracted" | "edited" | "approved" | "reopened" | "webhook" | "failed";

export type DocEvent = {
  id: string;
  documentId: string | null;
  workspaceId: string;
  kind: EventKind;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type Workspace = {
  id: string;
  webhookUrl: string | null;
  webhookSecret: string;
  createdAt: string;
};
