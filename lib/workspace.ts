import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { sampleFields, samples } from "@/lib/samples";
import { getStore } from "@/lib/store";
import type { DocumentRecord, Workspace } from "@/lib/types";
import { decideStatus, runChecks } from "@/lib/validate";

export const WS_COOKIE = "ds_ws";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const creating = new Map<string, Promise<Workspace>>();

/**
 * Every visitor gets a private workspace (an anonymous cookie set by the
 * middleware), pre-filled with the sample invoices. Nobody sees anyone
 * else's uploads.
 */
export async function currentWorkspace(): Promise<Workspace> {
  const id = (await cookies()).get(WS_COOKIE)?.value;
  if (!id || !UUID.test(id)) throw new Error("Missing workspace cookie");
  return ensureWorkspace(id);
}

export async function ensureWorkspace(id: string): Promise<Workspace> {
  const store = getStore();
  const existing = await store.getWorkspace(id);
  if (existing) return existing;
  if (!creating.has(id)) {
    creating.set(id, (async () => {
      const ws: Workspace = { id, webhookUrl: null, webhookSecret: `whsec_${randomBytes(18).toString("base64url")}`, createdAt: new Date().toISOString() };
      try {
        await store.createWorkspace(ws);
      } catch (e) {
        // Another request created it first.
        const again = await store.getWorkspace(id);
        if (again) return again;
        throw e;
      }
      await seedSamples(ws.id);
      return ws;
    })().finally(() => setTimeout(() => creating.delete(id), 10_000)));
  }
  return creating.get(id)!;
}

async function seedSamples(workspaceId: string) {
  const store = getStore();
  const now = Date.now();
  const docs: DocumentRecord[] = samples.map((s) => {
    const fields = sampleFields(s);
    const checks = runChecks(fields, s.line_items, null);
    const created = new Date(now - s.ageMinutes * 60_000).toISOString();
    const approvedAt = s.approvedMinutesAgo ? new Date(now - s.approvedMinutesAgo * 60_000).toISOString() : null;
    return {
      id: randomUUID(), workspaceId, fileName: s.file, mime: s.mime, filePath: `public:/samples/${s.file}`, pages: s.pages, isSample: true,
      status: approvedAt ? "approved" : decideStatus(fields, checks), documentType: s.document_type, method: s.method, model: s.model,
      durationMs: s.durationMs, fields, lineItems: s.line_items, checks, notes: s.notes, error: null, createdAt: created, updatedAt: approvedAt ?? created, approvedAt,
    };
  });
  await store.insertDocuments(docs);
}
