"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { notify } from "@/lib/documents";
import { checkRateLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import { checkWebhookUrl } from "@/lib/webhook";
import { currentWorkspace } from "@/lib/workspace";

export type FormState = { ok?: string; error?: string };

export async function saveWebhookAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ws = await currentWorkspace();
  const url = String(form.get("url") ?? "").trim();
  if (url) {
    const problem = await checkWebhookUrl(url);
    if (problem) return { error: problem };
  }
  await getStore().updateWorkspace(ws.id, { webhookUrl: url || null });
  revalidatePath("/developers");
  return { ok: url ? "Saved. Approved invoices will be sent here." : "Webhook removed." };
}

export async function testWebhookAction(): Promise<FormState> {
  const ws = await currentWorkspace();
  if (!ws.webhookUrl) return { error: "Save a webhook URL first." };
  if (!checkRateLimit(`webhook-test:${ws.id}`, 20).ok) return { error: "Too many test events. Try again later." };
  const r = await notify(ws, "ping", null, { message: "Test event from DocSense", workspace: ws.id.slice(0, 8) });
  revalidatePath("/developers");
  return r?.ok ? { ok: `Delivered: HTTP ${r.status} in ${r.ms} ms.` } : { error: `Not delivered: ${r?.error ?? `HTTP ${r?.status}`}` };
}

export async function rotateSecretAction(): Promise<FormState> {
  const ws = await currentWorkspace();
  await getStore().updateWorkspace(ws.id, { webhookSecret: `whsec_${randomBytes(18).toString("base64url")}` });
  revalidatePath("/developers");
  return { ok: "New signing secret created." };
}
