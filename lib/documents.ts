import "server-only";
import { randomUUID } from "node:crypto";
import { ACCEPTED, analyze, MAX_BYTES } from "@/lib/analyze";
import { UserError } from "@/lib/extract";
import { FIELDS, type FieldKey } from "@/lib/fields";
import { toJson } from "@/lib/export";
import { MAX_PAGES } from "@/lib/pdf-text";
import { getStore } from "@/lib/store";
import type { DocumentRecord, Fields, Workspace } from "@/lib/types";
import { decideStatus, duplicateKey, runChecks } from "@/lib/validate";
import { deliver } from "@/lib/webhook";

export { UserError };

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type UploadRequest = {
  fileName: string;
  mime: string;
  size: number;
  pages: { width: number; height: number }[];
};

/** Creates the document and returns one-time URLs the browser uploads the file (and page images) to. */
export async function createUpload(ws: Workspace, req: UploadRequest) {
  if (!ACCEPTED.includes(req.mime as (typeof ACCEPTED)[number])) throw new UserError("Upload a PDF, JPG, PNG or WebP file.");
  if (!(req.size > 0) || req.size > MAX_BYTES) throw new UserError("Files must be under 4 MB.");
  if (!req.pages.length || req.pages.length > MAX_PAGES) throw new UserError("Couldn't read the pages of this file.");
  const store = getStore();
  const id = randomUUID();
  const dir = `${ws.id}/${id}`;
  const isPdf = req.mime === "application/pdf";
  const filePath = `${dir}/original.${EXT[req.mime]}`;
  const pages = req.pages.map((p, i) => ({ path: isPdf ? `${dir}/page-${i + 1}.jpg` : filePath, width: Math.round(p.width), height: Math.round(p.height) }));
  const now = new Date().toISOString();
  const doc: DocumentRecord = {
    id, workspaceId: ws.id, fileName: req.fileName.slice(0, 120) || "document", mime: req.mime, filePath, pages, isSample: false,
    status: "processing", documentType: null, method: null, model: null, durationMs: null, fields: null, lineItems: [], checks: [],
    notes: null, error: null, createdAt: now, updatedAt: now, approvedAt: null,
  };
  await store.insertDocuments([doc]);
  await store.addEvent({ workspaceId: ws.id, documentId: id, kind: "uploaded", detail: { file: doc.fileName } });
  return {
    id,
    file: await store.createUploadUrl(filePath),
    pages: isPdf ? await Promise.all(pages.map((p) => store.createUploadUrl(p.path))) : [],
  };
}

/** Bundled samples can be re-run too ("Try a sample"): they're copied into a fresh document. */
export async function createFromSample(ws: Workspace, sampleDocId: string) {
  const store = getStore();
  const src = await store.getDocument(ws.id, sampleDocId);
  if (!src?.isSample) throw new UserError("Sample not found.");
  const now = new Date().toISOString();
  const id = randomUUID();
  const doc: DocumentRecord = {
    ...src, id, isSample: false, status: "processing", method: null, model: null, durationMs: null, fields: null, lineItems: [], checks: [],
    notes: null, error: null, createdAt: now, updatedAt: now, approvedAt: null,
  };
  await store.insertDocuments([doc]);
  await store.addEvent({ workspaceId: ws.id, documentId: id, kind: "uploaded", detail: { file: doc.fileName, sample: true } });
  return id;
}

async function readFile(path: string) {
  if (path.startsWith("public:")) {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const rel = path.slice("public:".length).replace(/^\/+/, "");
    if (!/^samples\/[\w.-]+$/.test(rel)) throw new Error("Bad sample path");
    return new Uint8Array(await readFile(join(process.cwd(), "public", rel)));
  }
  return getStore().download(path);
}

/** Runs the AI on an uploaded document and stores the result. */
export async function runExtraction(ws: Workspace, id: string): Promise<DocumentRecord> {
  const store = getStore();
  const doc = await store.getDocument(ws.id, id);
  if (!doc) throw new UserError("Document not found.");
  if (doc.isSample) throw new UserError("Samples are already extracted. Use “Try it live” to run one again.");

  try {
    const data = await readFile(doc.filePath);
    if (data.byteLength > MAX_BYTES) throw new UserError("Files must be under 4 MB.");
    const pageImages = doc.mime === "application/pdf"
      ? await Promise.all(doc.pages.map(async (p) => ({ data: await readFile(p.path), mime: "image/jpeg" })))
      : undefined;
    const a = await analyze({ mime: doc.mime, data, pageImages });
    const dup = await findDuplicate(ws.id, a.fields, id);
    const checks = runChecks(a.fields, a.lineItems, dup);
    const updated = await store.updateDocument(ws.id, id, {
      status: decideStatus(a.fields, checks), documentType: a.documentType, method: a.method, model: a.model, durationMs: a.durationMs,
      fields: a.fields, lineItems: a.lineItems, checks, notes: a.notes, error: null,
    });
    await store.addEvent({ workspaceId: ws.id, documentId: id, kind: "extracted", detail: { model: a.model, method: a.method, ms: a.durationMs, attempts: a.attempts, status: updated.status } });
    await notify(ws, "document.extracted", updated);
    return updated;
  } catch (e) {
    const message = e instanceof UserError ? e.message : "The AI couldn't read this document. Try again, or try a clearer copy.";
    console.error("Extraction failed", e);
    const updated = await store.updateDocument(ws.id, id, { status: "failed", error: message });
    await store.addEvent({ workspaceId: ws.id, documentId: id, kind: "failed", detail: { error: message } });
    return updated;
  }
}

async function findDuplicate(workspaceId: string, fields: Fields, excludeId: string) {
  const key = duplicateKey(fields);
  if (!key) return null;
  const docs = await getStore().listDocuments(workspaceId);
  return docs.find((d) => d.id !== excludeId && d.fields && d.status !== "failed" && duplicateKey(d.fields) === key) ?? null;
}

/** Parses what a reviewer typed into the right type for the field. */
export function parseInput(key: FieldKey, raw: string): string | number | null {
  const kind = FIELDS.find((f) => f.key === key)!.kind;
  const s = raw.trim();
  if (!s) return null;
  if (kind === "money" || kind === "percent") {
    let t = s.replace(/[^\d.,-]/g, "");
    const lastComma = t.lastIndexOf(","), lastDot = t.lastIndexOf(".");
    if (lastComma > lastDot && t.length - lastComma - 1 <= 2) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
    const n = Number(t);
    if (!Number.isFinite(n)) throw new UserError(`“${raw}” isn't a number.`);
    return Math.round(n * 1000) / 1000;
  }
  if (kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new UserError(`Dates must look like 2026-10-31.`);
    return s;
  }
  if (key === "currency") {
    if (!/^[A-Za-z]{3}$/.test(s)) throw new UserError("Currency must be a 3-letter code like EUR.");
    return s.toUpperCase();
  }
  return s.slice(0, 300);
}

/** Saves a reviewer's corrections, re-runs the checks and records what changed. */
export async function saveEdits(ws: Workspace, id: string, input: Partial<Record<FieldKey, string>>) {
  const store = getStore();
  const doc = await store.getDocument(ws.id, id);
  if (!doc?.fields) throw new UserError("Document not found.");
  if (doc.status === "approved") throw new UserError("Reopen the document before editing it.");
  const fields = structuredClone(doc.fields);
  const changes: { field: FieldKey; from: unknown; to: unknown }[] = [];
  for (const meta of FIELDS) {
    if (!(meta.key in input)) continue;
    const next = parseInput(meta.key, input[meta.key] ?? "");
    if (next === fields[meta.key].value) continue;
    changes.push({ field: meta.key, from: fields[meta.key].value, to: next });
    fields[meta.key] = { ...fields[meta.key], value: next, confidence: 1, source: "edited", note: undefined };
  }
  if (!changes.length) return doc;
  const dup = await findDuplicate(ws.id, fields, id);
  const checks = runChecks(fields, doc.lineItems, dup);
  const updated = await store.updateDocument(ws.id, id, { fields, checks, status: decideStatus(fields, checks) });
  await store.addEvent({ workspaceId: ws.id, documentId: id, kind: "edited", detail: { changes } });
  return updated;
}

export async function approve(ws: Workspace, id: string) {
  const store = getStore();
  const doc = await store.getDocument(ws.id, id);
  if (!doc?.fields || doc.status === "processing" || doc.status === "failed") throw new UserError("This document can't be approved yet.");
  if (doc.status === "approved") return doc;
  const updated = await store.updateDocument(ws.id, id, { status: "approved", approvedAt: new Date().toISOString() });
  await store.addEvent({ workspaceId: ws.id, documentId: id, kind: "approved", detail: { overrodeChecks: doc.checks.filter((c) => !c.ok).map((c) => c.id) } });
  await notify(ws, "document.approved", updated);
  return updated;
}

export async function reopen(ws: Workspace, id: string) {
  const store = getStore();
  const doc = await store.getDocument(ws.id, id);
  if (!doc?.fields || doc.status !== "approved") throw new UserError("Only approved documents can be reopened.");
  const updated = await store.updateDocument(ws.id, id, { status: decideStatus(doc.fields, doc.checks), approvedAt: null });
  await store.addEvent({ workspaceId: ws.id, documentId: id, kind: "reopened", detail: {} });
  return updated;
}

/** Sends a webhook if the workspace has one, and logs the attempt. */
export async function notify(ws: Workspace, event: string, doc: DocumentRecord | null, data?: unknown) {
  if (!ws.webhookUrl) return null;
  const result = await deliver(ws.webhookUrl, ws.webhookSecret, event, data ?? (doc ? toJson(doc) : null));
  await getStore().addEvent({ workspaceId: ws.id, documentId: doc?.id ?? null, kind: "webhook", detail: { event, url: ws.webhookUrl, ...result } });
  return result;
}
