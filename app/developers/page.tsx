import { headers } from "next/headers";
import { WebhookForm } from "@/components/WebhookForm";
import { timeAgo } from "@/lib/format";
import { getStore } from "@/lib/store";
import { currentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto bg-ink px-5 py-4 font-mono text-[12.5px] leading-[1.65] text-[#D7DBE2]">{children}</pre>
);

const RESPONSE = `{
  "status": "needs_review",
  "document_type": "invoice",
  "extraction": { "method": "text", "model": "openai/gpt-oss-120b", "duration_ms": 3120, "attempts": 1 },
  "fields": {
    "vendor_name": "Brightline Supplies B.V.",
    "invoice_number": "INV-2291",
    "issue_date": "2026-10-12",
    "due_date": "2026-11-11",
    "currency": "EUR",
    "subtotal": 3204,
    "tax_rate": 21,
    "tax_amount": 672.84,
    "total": 3876.84,
    …
  },
  "confidence": { "vendor_name": 0.99, "due_date": 0.7, … },
  "line_items": [
    { "description": "Industrial label printer", "quantity": 2, "unit_price": 620, "amount": 1240 },
    …
  ],
  "checks": [
    { "id": "lines_sum", "ok": true, "detail": "4 lines = 3204.00" },
    { "id": "tax_math", "ok": true, "detail": "3204.00 × 21% = 672.84" },
    …
  ],
  "needs_review": ["due_date"]
}`;

const VERIFY = `// Node.js: check that a webhook really came from DocSense
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(rawBody, headers, secret) {
  const ts = headers["x-docsense-timestamp"];
  const expected = "sha256=" + createHmac("sha256", secret).update(\`\${ts}.\${rawBody}\`).digest("hex");
  const given = headers["x-docsense-signature"] ?? "";
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  return fresh && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}`;

export default async function DevelopersPage() {
  const ws = await currentWorkspace();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const deliveries = (await getStore().listEvents(ws.id)).filter((e) => e.kind === "webhook").slice(0, 8);

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em]">API &amp; webhooks</h1>
      <p className="mt-3 max-w-[680px] text-mu">
        Send documents from your own system and get structured JSON back, or let DocSense push every approved invoice to your accounting tool.
      </p>

      <section className="mt-8 border-2 border-ink bg-white shadow-hard">
        <div className="flex flex-wrap items-baseline gap-3 border-b-2 border-ink px-5 py-3.5">
          <h2 className="text-[17px] font-semibold">REST API</h2>
          <code className="font-mono text-[13px] text-mu">POST /api/extract</code>
          <span className="ml-auto font-mono text-[12px] text-faint">demo limit: 10 requests / hour · nothing is stored</span>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-[14.5px]">Upload a PDF or image as the form field <code className="font-mono text-[13px]">file</code>. Text PDFs are read from their text layer; photos and scans go to a vision model.</p>
          <Code>{`curl -F "file=@invoice.pdf" ${proto}://${host}/api/extract`}</Code>
          <p className="text-[14.5px]">Response (shortened):</p>
          <Code>{RESPONSE}</Code>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="border-2 border-ink bg-white">
          <h2 className="border-b-2 border-ink px-5 py-3.5 text-[17px] font-semibold">Webhook</h2>
          <div className="p-5">
            <p className="mb-4 text-[14.5px] text-mu">
              We POST <code className="font-mono text-[13px]">document.extracted</code> and <code className="font-mono text-[13px]">document.approved</code> events as JSON, signed with HMAC-SHA256.
            </p>
            <WebhookForm url={ws.webhookUrl} secret={ws.webhookSecret} />
          </div>
        </div>
        <div className="min-w-0 space-y-6">
          <div className="border-2 border-ink bg-white">
            <h2 className="border-b-2 border-ink px-5 py-3.5 text-[17px] font-semibold">Verify the signature</h2>
            <Code>{VERIFY}</Code>
          </div>
          <div className="border-2 border-ink bg-white">
            <h2 className="border-b-2 border-ink px-5 py-3.5 text-[17px] font-semibold">Recent deliveries</h2>
            <ul className="font-mono text-[12.5px]">
              {deliveries.length === 0 && <li className="px-5 py-4 font-sans text-[14px] text-mu">None yet. Save a URL and send a test event.</li>}
              {deliveries.map((e) => {
                const d = e.detail as { event: string; ok: boolean; status: number; ms?: number; error?: string };
                return (
                  <li key={e.id} className="flex gap-3 border-b border-rule px-5 py-2 last:border-0">
                    <span className={d.ok ? "text-green" : "text-red"}>{d.ok ? d.status : "✗"}</span>
                    <span className="flex-1">{d.event}</span>
                    <span className="text-faint">{d.ok ? `${d.ms} ms` : d.error}</span>
                    <span className="w-16 text-right text-faint">{timeAgo(e.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
