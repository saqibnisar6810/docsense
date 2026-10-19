import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DocEvent, DocumentRecord, Workspace } from "@/lib/types";

export const BUCKET = "documents";
/** Uploaded files and their results are deleted after this long. */
export const RETENTION_HOURS = 24;

export interface Store {
  mode: "supabase" | "memory";
  getWorkspace(id: string): Promise<Workspace | null>;
  createWorkspace(ws: Workspace): Promise<void>;
  updateWorkspace(id: string, patch: Partial<Pick<Workspace, "webhookUrl" | "webhookSecret">>): Promise<void>;
  listDocuments(workspaceId: string): Promise<DocumentRecord[]>;
  getDocument(workspaceId: string, id: string): Promise<DocumentRecord | null>;
  insertDocuments(docs: DocumentRecord[]): Promise<void>;
  updateDocument(workspaceId: string, id: string, patch: Partial<DocumentRecord>): Promise<DocumentRecord>;
  addEvent(e: Omit<DocEvent, "id" | "createdAt">): Promise<void>;
  listEvents(workspaceId: string, documentId?: string): Promise<DocEvent[]>;
  /** Deletes expired uploads and abandoned workspaces. Returns what it removed. */
  cleanup(): Promise<{ documents: number; workspaces: number }>;
  // files
  createUploadUrl(path: string): Promise<string>;
  download(path: string): Promise<Uint8Array>;
  viewUrl(path: string): Promise<string>;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// ---------------------------------------------------------------- memory

type Mem = {
  workspaces: Map<string, Workspace & { touchedAt: string }>;
  docs: Map<string, DocumentRecord>;
  events: DocEvent[];
  files: Map<string, Uint8Array>;
};
const g = globalThis as unknown as { __docsense?: Mem };
const mem = (): Mem => (g.__docsense ??= { workspaces: new Map(), docs: new Map(), events: [] as DocEvent[], files: new Map() });

// Local uploads are signed so only URLs this server handed out are accepted.
const localSecret = () => process.env.LOCAL_UPLOAD_SECRET || "docsense-local-dev";
export const signLocalPath = (path: string) => createHmac("sha256", localSecret()).update(path).digest("hex").slice(0, 32);
export const memoryFiles = () => mem().files;

const memoryStore: Store = {
  mode: "memory",
  async getWorkspace(id) {
    const ws = mem().workspaces.get(id);
    if (ws) ws.touchedAt = new Date().toISOString();
    return ws ?? null;
  },
  async createWorkspace(ws) {
    mem().workspaces.set(ws.id, { ...ws, touchedAt: ws.createdAt });
  },
  async updateWorkspace(id, patch) {
    const ws = mem().workspaces.get(id);
    if (ws) Object.assign(ws, patch);
  },
  async listDocuments(workspaceId) {
    return [...mem().docs.values()].filter((d) => d.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getDocument(workspaceId, id) {
    const d = mem().docs.get(id);
    return d && d.workspaceId === workspaceId ? d : null;
  },
  async insertDocuments(docs) {
    for (const d of docs) mem().docs.set(d.id, structuredClone(d));
  },
  async updateDocument(workspaceId, id, patch) {
    const d = mem().docs.get(id);
    if (!d || d.workspaceId !== workspaceId) throw new Error("Document not found");
    Object.assign(d, structuredClone(patch), { updatedAt: new Date().toISOString() });
    return structuredClone(d);
  },
  async addEvent(e) {
    mem().events.push({ ...e, id: randomUUID(), createdAt: new Date().toISOString() });
  },
  async listEvents(workspaceId, documentId) {
    return mem().events.filter((e) => e.workspaceId === workspaceId && (!documentId || e.documentId === documentId)).reverse();
  },
  async cleanup() {
    const m = mem();
    let documents = 0, workspaces = 0;
    for (const d of m.docs.values()) {
      if (!d.isSample && d.createdAt < hoursAgo(RETENTION_HOURS)) {
        m.docs.delete(d.id); documents++;
        for (const p of [d.filePath, ...d.pages.map((x) => x.path)]) m.files.delete(p);
      }
    }
    for (const ws of m.workspaces.values()) {
      if (ws.touchedAt < hoursAgo(24 * 14)) {
        m.workspaces.delete(ws.id); workspaces++;
        for (const d of m.docs.values()) if (d.workspaceId === ws.id) m.docs.delete(d.id);
      }
    }
    return { documents, workspaces };
  },
  async createUploadUrl(path) {
    return `/api/local-upload?path=${encodeURIComponent(path)}&sig=${signLocalPath(path)}`;
  },
  async download(path) {
    const f = mem().files.get(path);
    if (!f) throw new Error("File not found");
    return f;
  },
  async viewUrl(path) {
    if (path.startsWith("public:")) return path.slice("public:".length);
    return `/api/local-file?path=${encodeURIComponent(path)}&sig=${signLocalPath(path)}`;
  },
};

// -------------------------------------------------------------- supabase

type DocRow = {
  id: string; workspace_id: string; file_name: string; mime: string; file_path: string; pages: DocumentRecord["pages"];
  is_sample: boolean; status: DocumentRecord["status"]; document_type: string | null; method: DocumentRecord["method"];
  model: string | null; duration_ms: number | null; fields: DocumentRecord["fields"]; line_items: DocumentRecord["lineItems"];
  checks: DocumentRecord["checks"]; notes: string | null; error: string | null; created_at: string; updated_at: string; approved_at: string | null;
};

const toDoc = (r: DocRow): DocumentRecord => ({
  id: r.id, workspaceId: r.workspace_id, fileName: r.file_name, mime: r.mime, filePath: r.file_path, pages: r.pages ?? [],
  isSample: r.is_sample, status: r.status, documentType: r.document_type, method: r.method, model: r.model, durationMs: r.duration_ms,
  fields: r.fields, lineItems: r.line_items ?? [], checks: r.checks ?? [], notes: r.notes, error: r.error,
  createdAt: r.created_at, updatedAt: r.updated_at, approvedAt: r.approved_at,
});

const COLS: Record<keyof DocumentRecord, keyof DocRow> = {
  id: "id", workspaceId: "workspace_id", fileName: "file_name", mime: "mime", filePath: "file_path", pages: "pages", isSample: "is_sample",
  status: "status", documentType: "document_type", method: "method", model: "model", durationMs: "duration_ms", fields: "fields",
  lineItems: "line_items", checks: "checks", notes: "notes", error: "error", createdAt: "created_at", updatedAt: "updated_at", approvedAt: "approved_at",
};

const toRow = (d: Partial<DocumentRecord>) =>
  Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined).map(([k, v]) => [COLS[k as keyof DocumentRecord], v]));

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

function supabaseStore(db: SupabaseClient): Store {
  const files = () => db.storage.from(BUCKET);
  return {
    mode: "supabase",
    async getWorkspace(id) {
      const r = must(await db.from("workspaces").update({ touched_at: new Date().toISOString() }).eq("id", id).select().maybeSingle()) as
        | { id: string; webhook_url: string | null; webhook_secret: string; created_at: string } | null;
      return r ? { id: r.id, webhookUrl: r.webhook_url, webhookSecret: r.webhook_secret, createdAt: r.created_at } : null;
    },
    async createWorkspace(ws) {
      must(await db.from("workspaces").insert({ id: ws.id, webhook_url: ws.webhookUrl, webhook_secret: ws.webhookSecret, created_at: ws.createdAt, touched_at: ws.createdAt }));
    },
    async updateWorkspace(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.webhookUrl !== undefined) row.webhook_url = patch.webhookUrl;
      if (patch.webhookSecret !== undefined) row.webhook_secret = patch.webhookSecret;
      must(await db.from("workspaces").update(row).eq("id", id));
    },
    async listDocuments(workspaceId) {
      const rows = must(await db.from("documents").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(200));
      return (rows as DocRow[]).map(toDoc);
    },
    async getDocument(workspaceId, id) {
      const r = must(await db.from("documents").select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle());
      return r ? toDoc(r as DocRow) : null;
    },
    async insertDocuments(docs) {
      if (docs.length) must(await db.from("documents").insert(docs.map(toRow)));
    },
    async updateDocument(workspaceId, id, patch) {
      const r = must(await db.from("documents").update({ ...toRow(patch), updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", id).select().single());
      return toDoc(r as DocRow);
    },
    async addEvent(e) {
      must(await db.from("events").insert({ document_id: e.documentId, workspace_id: e.workspaceId, kind: e.kind, detail: e.detail }));
    },
    async listEvents(workspaceId, documentId) {
      let q = db.from("events").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50);
      if (documentId) q = q.eq("document_id", documentId);
      const rows = must(await q) as Array<{ id: number; document_id: string | null; workspace_id: string; kind: DocEvent["kind"]; detail: Record<string, unknown>; created_at: string }>;
      return rows.map((r) => ({ id: String(r.id), documentId: r.document_id, workspaceId: r.workspace_id, kind: r.kind, detail: r.detail, createdAt: r.created_at }));
    },
    async cleanup() {
      const old = must(await db.from("documents").select("id, file_path, pages").eq("is_sample", false).lt("created_at", hoursAgo(RETENTION_HOURS)).limit(500)) as Array<Pick<DocRow, "id" | "file_path" | "pages">>;
      const paths = old.flatMap((d) => [d.file_path, ...(d.pages ?? []).map((p) => p.path)]).filter((p) => !p.startsWith("public:"));
      for (let i = 0; i < paths.length; i += 100) await files().remove(paths.slice(i, i + 100));
      if (old.length) must(await db.from("documents").delete().in("id", old.map((d) => d.id)));
      const gone = must(await db.from("workspaces").delete().lt("touched_at", hoursAgo(24 * 14)).select("id")) as Array<{ id: string }>;
      return { documents: old.length, workspaces: gone.length };
    },
    async createUploadUrl(path) {
      const { signedUrl } = must(await files().createSignedUploadUrl(path)) as { signedUrl: string };
      return signedUrl;
    },
    async download(path) {
      const blob = must(await files().download(path)) as Blob;
      return new Uint8Array(await blob.arrayBuffer());
    },
    async viewUrl(path) {
      if (path.startsWith("public:")) return path.slice("public:".length);
      const { signedUrl } = must(await files().createSignedUrl(path, 3600)) as { signedUrl: string };
      return signedUrl;
    },
  };
}

let cached: Store | null = null;
export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? supabaseStore(createClient(url, key, { auth: { persistSession: false } })) : memoryStore;
  return cached;
}
