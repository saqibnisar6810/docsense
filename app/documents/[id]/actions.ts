"use server";
import { revalidatePath } from "next/cache";
import { approve, reopen, saveEdits, UserError } from "@/lib/documents";
import { FIELD_KEYS, type FieldKey } from "@/lib/fields";
import { currentWorkspace } from "@/lib/workspace";

type Result = { ok: true } | { ok: false, error: string };

async function run(id: string, fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    revalidatePath(`/documents/${id}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function saveAction(id: string, values: Record<string, string>, thenApprove: boolean): Promise<Result> {
  const ws = await currentWorkspace();
  const input: Partial<Record<FieldKey, string>> = {};
  for (const k of FIELD_KEYS) if (typeof values[k] === "string") input[k] = values[k].slice(0, 300);
  return run(id, async () => {
    await saveEdits(ws, id, input);
    if (thenApprove) await approve(ws, id);
  });
}

export async function reopenAction(id: string): Promise<Result> {
  const ws = await currentWorkspace();
  return run(id, () => reopen(ws, id));
}
