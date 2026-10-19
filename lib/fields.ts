import { z } from "zod";

export type FieldKind = "text" | "date" | "money" | "percent" | "code";

/** The 14 header fields DocSense extracts, in display order. */
export const FIELDS = [
  { key: "vendor_name", label: "Vendor", kind: "text", hint: "Company that issued the invoice" },
  { key: "vendor_tax_id", label: "Vendor VAT / tax ID", kind: "code", hint: "VAT number, EIN, USt-IdNr…" },
  { key: "vendor_address", label: "Vendor address", kind: "text", hint: "Street, city, postcode" },
  { key: "customer_name", label: "Billed to", kind: "text", hint: "Customer company or person" },
  { key: "invoice_number", label: "Invoice no.", kind: "code", hint: "Invoice or receipt number" },
  { key: "po_number", label: "PO number", kind: "code", hint: "Purchase order reference" },
  { key: "issue_date", label: "Issue date", kind: "date", hint: "YYYY-MM-DD" },
  { key: "due_date", label: "Due date", kind: "date", hint: "YYYY-MM-DD" },
  { key: "payment_terms", label: "Payment terms", kind: "text", hint: "e.g. Net 30" },
  { key: "currency", label: "Currency", kind: "code", hint: "ISO code, e.g. EUR" },
  { key: "subtotal", label: "Subtotal", kind: "money", hint: "Before tax" },
  { key: "tax_rate", label: "Tax rate %", kind: "percent", hint: "e.g. 21" },
  { key: "tax_amount", label: "Tax amount", kind: "money", hint: "VAT / sales tax" },
  { key: "total", label: "Total", kind: "money", hint: "Amount due" },
] as const satisfies ReadonlyArray<{ key: string; label: string; kind: FieldKind; hint: string }>;

export type FieldKey = (typeof FIELDS)[number]["key"];
export const FIELD_KEYS = FIELDS.map((f) => f.key) as FieldKey[];
export const fieldMeta = (key: FieldKey) => FIELDS.find((f) => f.key === key)!;

const conf = z.number().min(0).max(1);
const str = z.object({ value: z.string().nullable(), confidence: conf });
const num = z.object({ value: z.number().nullable(), confidence: conf });

/**
 * What the model must return. Every field is `{ value, confidence }` so the
 * review screen can flag uncertain values one by one.
 */
export const ModelOutput = z.object({
  document_type: z.enum(["invoice", "receipt", "credit_note", "other"]),
  fields: z.object({
    vendor_name: str,
    vendor_tax_id: str,
    vendor_address: str,
    customer_name: str,
    invoice_number: str,
    po_number: str,
    issue_date: str,
    due_date: str,
    payment_terms: str,
    currency: str,
    subtotal: num,
    tax_rate: num,
    tax_amount: num,
    total: num,
  }),
  line_items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().nullable(),
      unit_price: z.number().nullable(),
      amount: z.number().nullable(),
    }),
  ).max(60),
  notes: z.string().nullable(),
});
export type ModelOutput = z.infer<typeof ModelOutput>;

/** Plain-language shape for models that only support JSON mode. */
export const SHAPE_HINT = `{
  "document_type": "invoice" | "receipt" | "credit_note" | "other",
  "fields": {
${FIELDS.map((f) => `    "${f.key}": { "value": ${f.kind === "money" || f.kind === "percent" ? "number" : "string"} | null, "confidence": number }`).join(",\n")}
  },
  "line_items": [{ "description": string, "quantity": number | null, "unit_price": number | null, "amount": number | null }],
  "notes": string | null
}`;
