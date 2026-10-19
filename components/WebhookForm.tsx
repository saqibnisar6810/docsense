"use client";
import { useActionState, useState } from "react";
import { rotateSecretAction, saveWebhookAction, testWebhookAction, type FormState } from "@/app/developers/actions";

export function WebhookForm({ url, secret }: { url: string | null; secret: string }) {
  const [saved, save, saving] = useActionState<FormState, FormData>(saveWebhookAction, {});
  const [tested, test, testing] = useActionState<FormState>(testWebhookAction, {});
  const [rotated, rotate, rotating] = useActionState<FormState>(rotateSecretAction, {});
  const [reveal, setReveal] = useState(false);
  const msg = (s: FormState) => (s.error ? <p className="text-[13.5px] text-red">{s.error}</p> : s.ok ? <p className="text-[13.5px] text-green">{s.ok}</p> : null);

  return (
    <div className="space-y-5">
      <form action={save} className="space-y-2">
        <label htmlFor="url" className="block text-[13.5px] font-medium">Endpoint URL</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="url"
            name="url"
            type="url"
            defaultValue={url ?? ""}
            placeholder="https://your-app.com/webhooks/docsense"
            className="min-w-0 flex-1 border-2 border-ink bg-white px-3 py-2 font-mono text-[13.5px] outline-none focus:border-blue"
          />
          <button disabled={saving} className="border-2 border-blue bg-blue px-4 py-2 font-semibold text-white hover:bg-blue-dark disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="text-[13px] text-mu">
          Tip: get a free test URL from <a href="https://webhook.site" target="_blank" rel="noreferrer" className="text-blue underline underline-offset-2">webhook.site</a> and watch events arrive.
        </p>
        {msg(saved)}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <form action={test}>
          <button disabled={testing || !url} className="border-2 border-ink bg-white px-4 py-2 font-medium shadow-hard-sm hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-50">
            {testing ? "Sending…" : "Send test event"}
          </button>
        </form>
        {msg(tested)}
      </div>

      <div className="border-t border-rule pt-4">
        <div className="text-[13.5px] font-medium">Signing secret</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="border border-rule bg-[#f4f5f7] px-2 py-1 font-mono text-[13px]">{reveal ? secret : `whsec_${"•".repeat(16)}`}</code>
          <button type="button" onClick={() => setReveal((r) => !r)} className="font-mono text-[12.5px] text-blue hover:underline">{reveal ? "hide" : "reveal"}</button>
          <form action={rotate}>
            <button disabled={rotating} className="font-mono text-[12.5px] text-mu hover:text-ink hover:underline">{rotating ? "rotating…" : "rotate"}</button>
          </form>
        </div>
        {msg(rotated)}
      </div>
    </div>
  );
}
