import "server-only";
import { extract, UserError, type ExtractInput } from "@/lib/extract";
import { FIELDS, type FieldKey } from "@/lib/fields";
import { locate, pagesToText, type TextPage } from "@/lib/locate";
import { hasTextLayer, readPdfText } from "@/lib/pdf-text";
import type { Fields, LineItem } from "@/lib/types";

export const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_BYTES = 4 * 1024 * 1024;

export type Analysis = {
  method: "text" | "vision";
  model: string;
  attempts: number;
  durationMs: number;
  documentType: string;
  fields: Fields;
  lineItems: LineItem[];
  notes: string | null;
};

/**
 * The whole extraction: read the PDF's text layer when it has one (cheap and
 * exact), otherwise send page images to a vision model. Then check each value
 * against the document and lower the confidence of anything not printed on it.
 */
export async function analyze(input: {
  mime: string;
  data: Uint8Array;
  pageImages?: { data: Uint8Array; mime: string }[];
}): Promise<Analysis> {
  let pages: TextPage[] = [];
  let req: ExtractInput;

  if (input.mime === "application/pdf") {
    try {
      pages = (await readPdfText(input.data)).pages;
    } catch {
      throw new UserError("This PDF couldn't be opened. It may be damaged or password protected.");
    }
    if (hasTextLayer(pages)) req = { kind: "text", text: pagesToText(pages) };
    else if (input.pageImages?.length) req = { kind: "images", images: input.pageImages };
    else req = { kind: "pdf", data: input.data };
  } else {
    req = { kind: "images", images: input.pageImages?.length ? input.pageImages : [{ data: input.data, mime: input.mime }] };
  }

  const result = await extract(req);
  const verify = req.kind === "text";

  const fields = {} as Fields;
  for (const meta of FIELDS) {
    const raw = result.output.fields[meta.key as FieldKey];
    let confidence = raw.confidence;
    let note: string | undefined;
    const box = verify && raw.value !== null ? locate(pages, meta.kind, raw.value) : null;
    if (verify && raw.value !== null && !box && meta.key !== "currency") {
      // Not printed as-is: the model worked it out or reworded it. Worth a look.
      if (confidence > 0.7) {
        confidence = 0.7;
        note = "Not found word-for-word on the document";
      }
    }
    if (!verify) confidence = Math.min(confidence, 0.97); // image reads are never certain
    fields[meta.key] = { value: raw.value, confidence: Math.round(confidence * 100) / 100, box, source: "model", ...(note ? { note } : {}) };
  }

  return {
    method: result.method,
    model: result.model,
    attempts: result.attempts,
    durationMs: result.durationMs,
    documentType: result.output.document_type,
    fields,
    lineItems: result.output.line_items,
    notes: result.output.notes,
  };
}
