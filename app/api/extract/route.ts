import { ACCEPTED, analyze, MAX_BYTES } from "@/lib/analyze";
import { UserError } from "@/lib/extract";
import { FIELDS } from "@/lib/fields";
import { checkRateLimit, ipOf } from "@/lib/ratelimit";
import { decideStatus, runChecks } from "@/lib/validate";

export const maxDuration = 60;

/**
 * Public REST endpoint. Send a file, get JSON back. Nothing is stored.
 *   curl -F file=@invoice.pdf https://<host>/api/extract
 */
export async function POST(req: Request) {
  const limit = checkRateLimit(`api:${ipOf(req)}`, Number(process.env.API_RATE_LIMIT_PER_HOUR || 10));
  if (!limit.ok) return Response.json({ error: "Rate limit reached for this hour.", retry_after_sec: limit.retryAfterSec }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Send the document as multipart form field “file”." }, { status: 400 });
  const byExt: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const mime = ACCEPTED.includes(file.type as (typeof ACCEPTED)[number]) ? file.type : byExt[file.name.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime) return Response.json({ error: "Supported types: PDF, JPG, PNG, WebP." }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Files must be under 4 MB." }, { status: 413 });

  try {
    const a = await analyze({ mime, data: new Uint8Array(await file.arrayBuffer()) });
    const checks = runChecks(a.fields, a.lineItems, null);
    return Response.json({
      status: decideStatus(a.fields, checks),
      document_type: a.documentType,
      extraction: { method: a.method, model: a.model, duration_ms: a.durationMs, attempts: a.attempts },
      fields: Object.fromEntries(FIELDS.map((f) => [f.key, a.fields[f.key].value])),
      confidence: Object.fromEntries(FIELDS.map((f) => [f.key, a.fields[f.key].confidence])),
      line_items: a.lineItems,
      checks: checks.filter((c) => c.id !== "duplicate").map((c) => ({ id: c.id, ok: c.ok, detail: c.detail })),
      needs_review: FIELDS.filter((f) => a.fields[f.key].value !== null && a.fields[f.key].confidence < 0.8).map((f) => f.key),
      notes: a.notes,
    });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 422 });
    console.error(e);
    return Response.json({ error: "Extraction failed." }, { status: 500 });
  }
}
