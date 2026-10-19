import { getStore, memoryFiles, signLocalPath } from "@/lib/store";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

/** Serves uploaded files in local (no Supabase) mode. */
export async function GET(req: Request) {
  if (getStore().mode !== "memory") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "";
  if (url.searchParams.get("sig") !== signLocalPath(path)) return new Response("Forbidden", { status: 403 });
  const data = memoryFiles().get(path);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Blob([new Uint8Array(data)]), { headers: { "content-type": TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream", "cache-control": "private, max-age=3600" } });
}
