import { z } from "zod";
import { createUpload, UserError } from "@/lib/documents";
import { checkRateLimit, ipOf } from "@/lib/ratelimit";
import { currentWorkspace } from "@/lib/workspace";

const Body = z.object({
  fileName: z.string().min(1).max(200),
  mime: z.string().max(60),
  size: z.number().int().positive(),
  pages: z.array(z.object({ width: z.number().positive().max(10000), height: z.number().positive().max(10000) })).min(1).max(3),
});

/** Step 1 of an upload: create the document and get signed URLs to upload the file to. */
export async function POST(req: Request) {
  const limit = checkRateLimit(`upload:${ipOf(req)}`);
  if (!limit.ok) return Response.json({ error: "You've reached the demo limit of uploads for this hour. Try again later." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  try {
    const ws = await currentWorkspace();
    return Response.json(await createUpload(ws, parsed.data));
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Couldn't start the upload." }, { status: 500 });
  }
}
