import { MAX_BYTES } from "@/lib/analyze";
import { getStore, memoryFiles, signLocalPath } from "@/lib/store";

/** Stand-in for Supabase Storage signed uploads when running without Supabase. */
export async function PUT(req: Request) {
  if (getStore().mode !== "memory") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "";
  if (!path || url.searchParams.get("sig") !== signLocalPath(path)) return new Response("Forbidden", { status: 403 });
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength > MAX_BYTES) return new Response("Too large", { status: 413 });
  memoryFiles().set(path, data);
  return Response.json({ Key: path });
}
