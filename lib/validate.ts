import type { FieldKey } from "@/lib/fields";
import type { Check, DocStatus, Fields, LineItem } from "@/lib/types";

/** Fields below this confidence go to a person for review. */
export const REVIEW_THRESHOLD = 0.8;

const money = (n: number) => n.toFixed(2);
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol + 1e-9;
const num = (f: Fields, k: FieldKey) => (typeof f[k]?.value === "number" ? (f[k].value as number) : null);
const str = (f: Fields, k: FieldKey) => (typeof f[k]?.value === "string" && f[k].value ? (f[k].value as string) : null);

export function runChecks(fields: Fields, lines: LineItem[], duplicateOf?: { fileName: string } | null): Check[] {
  const checks: Check[] = [];
  const subtotal = num(fields, "subtotal");
  const tax = num(fields, "tax_amount");
  const rate = num(fields, "tax_rate");
  const total = num(fields, "total");

  const missing = (["vendor_name", "invoice_number", "issue_date", "total"] as FieldKey[]).filter((k) => fields[k]?.value === null || fields[k]?.value === "");
  checks.push({
    id: "required", label: "Required fields present", ok: missing.length === 0, fields: missing,
    detail: missing.length ? `Missing: ${missing.join(", ")}` : "Vendor, number, date and total found",
  });

  const priced = lines.filter((l) => l.amount !== null);
  if (priced.length) {
    const sum = priced.reduce((s, l) => s + (l.amount as number), 0);
    const target = subtotal ?? (total !== null ? total - (tax ?? 0) : null);
    if (target !== null) {
      const ok = near(sum, target, 0.02 * Math.max(1, priced.length / 4));
      checks.push({
        id: "lines_sum", label: "Line items add up to the subtotal", ok, fields: ["subtotal"],
        detail: ok ? `${priced.length} lines = ${money(sum)}` : `Lines add up to ${money(sum)}, subtotal says ${money(target)} (off by ${money(Math.abs(sum - target))})`,
      });
    }
  }

  const badLines = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.quantity !== null && l.unit_price !== null && l.amount !== null && !near(l.quantity * l.unit_price, l.amount, 0.02));
  if (lines.some((l) => l.quantity !== null && l.unit_price !== null && l.amount !== null)) {
    checks.push({
      id: "line_math", label: "Quantity × price = amount on every line", ok: badLines.length === 0, fields: [],
      detail: badLines.length ? `Line ${badLines.map((b) => b.i + 1).join(", ")} doesn't multiply out` : "Every line multiplies out",
    });
  }

  if (subtotal !== null && rate !== null && tax !== null) {
    const expected = (subtotal * rate) / 100;
    const ok = near(expected, tax, 0.05);
    checks.push({
      id: "tax_math", label: `Tax matches the ${rate}% rate`, ok, fields: ["tax_amount", "tax_rate"],
      detail: ok ? `${money(subtotal)} × ${rate}% = ${money(tax)}` : `${money(subtotal)} × ${rate}% = ${money(expected)}, invoice says ${money(tax)}`,
    });
  }

  if (subtotal !== null && total !== null) {
    const expected = subtotal + (tax ?? 0);
    const ok = near(expected, total, 0.02);
    checks.push({
      id: "total_math", label: "Subtotal + tax = total", ok, fields: ["total"],
      detail: ok ? `${money(subtotal)} + ${money(tax ?? 0)} = ${money(total)}` : `${money(subtotal)} + ${money(tax ?? 0)} = ${money(expected)}, invoice says ${money(total)}`,
    });
  }

  const issue = str(fields, "issue_date");
  const due = str(fields, "due_date");
  if (issue && due) {
    const ok = due >= issue;
    checks.push({ id: "dates", label: "Due date is after the issue date", ok, fields: ["due_date"], detail: ok ? `${issue} → ${due}` : `Due ${due} is before issue ${issue}` });
  }

  checks.push({
    id: "duplicate", label: "Not a duplicate", ok: !duplicateOf, fields: duplicateOf ? ["invoice_number"] : [],
    detail: duplicateOf ? `Same vendor and invoice number as ${duplicateOf.fileName}` : "No other invoice with this vendor and number",
  });

  return checks;
}

export function lowConfidence(fields: Fields): FieldKey[] {
  return (Object.keys(fields) as FieldKey[]).filter((k) => fields[k].value !== null && fields[k].confidence < REVIEW_THRESHOLD);
}

export function decideStatus(fields: Fields, checks: Check[]): DocStatus {
  return checks.some((c) => !c.ok) || lowConfidence(fields).length ? "needs_review" : "ready";
}

/** Fields a reviewer should look at: low confidence or part of a failed check. */
export function flaggedFields(fields: Fields, checks: Check[]): Set<FieldKey> {
  const out = new Set<FieldKey>(lowConfidence(fields));
  for (const c of checks) if (!c.ok) c.fields.forEach((f) => out.add(f));
  return out;
}

export const duplicateKey = (fields: Fields) => {
  const v = str(fields, "vendor_name")?.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(bv|gmbh|ltd|inc|llc|sa|srl)$/, "");
  const n = str(fields, "invoice_number")?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return v && n ? `${v}:${n}` : null;
};
