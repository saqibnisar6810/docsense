import { FIELDS } from "@/lib/fields";
import type { DocumentRecord } from "@/lib/types";

const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote when needed, and stop spreadsheets from running "=..." as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const line = (cells: unknown[]) => cells.map(cell).join(",");

/** One row per invoice. */
export function invoicesCsv(docs: DocumentRecord[]) {
  const head = ["document_id", "file_name", "status", ...FIELDS.map((f) => f.key), "line_count", "approved_at"];
  const rows = docs.map((d) => [d.id, d.fileName, d.status, ...FIELDS.map((f) => d.fields?.[f.key]?.value ?? null), d.lineItems.length, d.approvedAt]);
  return [line(head), ...rows.map(line)].join("\r\n") + "\r\n";
}

/** One row per line item, with the invoice it belongs to. */
export function lineItemsCsv(docs: DocumentRecord[]) {
  const head = ["document_id", "vendor_name", "invoice_number", "currency", "line", "description", "quantity", "unit_price", "amount"];
  const rows = docs.flatMap((d) =>
    d.lineItems.map((l, i) => [d.id, d.fields?.vendor_name.value, d.fields?.invoice_number.value, d.fields?.currency.value, i + 1, l.description, l.quantity, l.unit_price, l.amount]),
  );
  return [line(head), ...rows.map(line)].join("\r\n") + "\r\n";
}

/** The public JSON shape (API responses and webhooks). */
export function toJson(d: DocumentRecord) {
  return {
    id: d.id,
    file_name: d.fileName,
    status: d.status,
    document_type: d.documentType,
    extraction: { method: d.method, model: d.model, duration_ms: d.durationMs },
    fields: Object.fromEntries(FIELDS.map((f) => [f.key, d.fields?.[f.key]?.value ?? null])),
    confidence: Object.fromEntries(FIELDS.map((f) => [f.key, d.fields?.[f.key]?.confidence ?? null])),
    line_items: d.lineItems,
    checks: d.checks.map((c) => ({ id: c.id, ok: c.ok, detail: c.detail })),
    needs_review: FIELDS.filter((f) => (d.fields?.[f.key]?.confidence ?? 1) < 0.8 && d.fields?.[f.key]?.value !== null).map((f) => f.key),
    approved_at: d.approvedAt,
    created_at: d.createdAt,
  };
}
