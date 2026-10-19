import { z } from "zod";
import { createFromSample, UserError } from "@/lib/documents";
import { checkRateLimit, ipOf } from "@/lib/ratelimit";
import { currentWorkspace } from "@/lib/workspace";

/** Copies a bundled sample into a new document so it can be extracted live. */
export async function POST(req: Request) {
  const limit = checkRateLimit(`upload:${ipOf(req)}`);
  if (!limit.ok) return Response.json({ error: "You've reached the demo limit for this hour. Try again later." }, { status: 429 });
  const parsed = z.object({ sampleId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  try {
    const ws = await currentWorkspace();
    return Response.json({ id: await createFromSample(ws, parsed.data.sampleId) });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Couldn't start the extraction." }, { status: 500 });
  }
}
