import { runExtraction, UserError } from "@/lib/documents";
import { toJson } from "@/lib/export";
import { currentWorkspace } from "@/lib/workspace";

export const maxDuration = 60;

/** Step 2: the file is uploaded, so run the AI on it. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ws = await currentWorkspace();
    const doc = await runExtraction(ws, id);
    return Response.json(toJson(doc));
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Extraction failed." }, { status: 500 });
  }
}
