import { getStore } from "@/lib/store";

/**
 * Runs daily (vercel.json). Deletes uploads older than 24 hours and abandoned
 * workspaces. The query also keeps a free Supabase project from pausing.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const removed = await getStore().cleanup();
  return Response.json({ ok: true, removed });
}
