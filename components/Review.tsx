"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { reopenAction, saveAction } from "@/app/documents/[id]/actions";
import { FIELDS, type FieldKey } from "@/lib/fields";
import { money, plainNumber, timeAgo } from "@/lib/format";
import type { DocEvent, DocumentRecord, PageImage } from "@/lib/types";
import { flaggedFields, REVIEW_THRESHOLD } from "@/lib/validate";

type Props = { doc: DocumentRecord; pages: (PageImage & { url: string })[]; events: DocEvent[] };

const MONEY = new Set(FIELDS.filter((f) => f.kind === "money").map((f) => f.key as string));
const display = (v: string | number | null, key?: string) =>
  v === null ? "" : typeof v === "number" ? (key && MONEY.has(key) ? v.toFixed(2) : String(v)) : v;

export function Review({ doc, pages, events }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<FieldKey | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [retrying, setRetrying] = useState(false);

  // Fresh values whenever the server sends a new version.
  useEffect(() => {
    setValues(Object.fromEntries(FIELDS.map((f) => [f.key, display(doc.fields?.[f.key]?.value ?? null, f.key)])));
  }, [doc]);

  // While the AI is still working (e.g. opened from the upload list), check back.
  useEffect(() => {
    if (doc.status !== "processing") return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [doc.status, router]);

  const flagged = useMemo(() => (doc.fields ? flaggedFields(doc.fields, doc.checks) : new Set<FieldKey>()), [doc]);
  const dirty = doc.fields ? FIELDS.some((f) => (values[f.key] ?? "") !== display(doc.fields![f.key].value, f.key)) : false;
  const approved = doc.status === "approved";
  const failing = doc.checks.filter((c) => !c.ok);
  const currency = doc.fields?.currency.value;

  const submit = (thenApprove: boolean) => {
    setError(null);
    const changed = Object.fromEntries(FIELDS.filter((f) => (values[f.key] ?? "") !== display(doc.fields![f.key].value, f.key)).map((f) => [f.key, values[f.key]]));
    start(async () => {
      const r = await saveAction(doc.id, changed, thenApprove);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  };

  const retry = async () => {
    setRetrying(true);
    setError(null);
    const res = await fetch(`/api/documents/${doc.id}/extract`, { method: "POST" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Extraction failed.");
    setRetrying(false);
    router.refresh();
  };

  return (
    <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_540px]">
      {/* ------------------------------------------------ document viewer */}
      <section className="border-2 border-ink bg-white lg:sticky lg:top-[76px]">
        <div className="flex items-center gap-3 border-b-2 border-ink px-4 py-2.5 font-mono text-[12px] text-mu">
          <span>{pages.length} page{pages.length === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{doc.mime === "application/pdf" ? "PDF" : "Photo"}</span>
          {doc.method === "vision" && <span className="hidden sm:inline">· highlights need a PDF text layer</span>}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-ink">
            <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} className="size-3.5 accent-[#1F4DFF]" />
            Highlights
          </label>
        </div>
        <div className="max-h-[calc(100vh-150px)] overflow-auto bg-[#d9dce1] p-4 sm:p-6">
          {pages.map((p, i) => (
            <div key={p.path} className="relative mx-auto mb-4 bg-white shadow-[0_1px_0_#0002,0_18px_40px_-20px_#0006] last:mb-0" style={{ maxWidth: 760, aspectRatio: `${p.width} / ${p.height}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Page ${i + 1} of ${doc.fileName}`} className="absolute inset-0 size-full object-contain" />
              {doc.status === "processing" && (
                <div className="absolute inset-0 overflow-hidden bg-blue/5">
                  <div className="h-full w-full animate-[scan_2.2s_ease-in-out_infinite] border-t-[3px] border-blue bg-gradient-to-b from-blue/15 to-transparent" style={{ height: "18%" }} />
                </div>
              )}
              {showBoxes && doc.fields &&
                FIELDS.map((f) => {
                  const box = doc.fields![f.key].box;
                  if (!box || box.page !== i + 1) return null;
                  const on = active === f.key;
                  const warn = flagged.has(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-label={f.label}
                      onMouseEnter={() => setActive(f.key)}
                      onMouseLeave={() => setActive(null)}
                      onClick={() => document.getElementById(`field-${f.key}`)?.focus()}
                      className={`absolute transition-colors ${on ? "z-10 border-2 border-blue bg-blue/15" : warn ? "border-2 border-amber bg-amber/10" : "border border-blue/60 bg-blue/[0.06] hover:bg-blue/15"}`}
                      style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                    >
                      {(on || warn) && (
                        <span className={`absolute -top-[19px] left-[-2px] whitespace-nowrap px-1.5 py-px font-mono text-[10.5px] leading-[16px] text-white ${on ? "bg-blue" : "bg-amber"}`}>
                          {f.key}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ extracted data */}
      <div className="space-y-6">
        <section className="border-2 border-ink bg-white shadow-hard">
          <div className="flex items-center gap-3 border-b-2 border-ink px-5 py-3.5">
            <h2 className="text-[17px] font-semibold">{(doc.fields?.invoice_number.value as string) ?? "Document"} · {doc.status === "processing" ? "extracting…" : doc.status === "failed" ? "failed" : "extracted"}</h2>
            {doc.durationMs && (
              <span className="ml-auto text-right font-mono text-[12px] leading-tight text-mu">
                {doc.method === "text" ? "text layer" : "vision"} · {doc.model}
                <br />
                {(doc.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {doc.status === "processing" && <p className="px-5 py-10 text-center text-mu">The AI is reading this document…</p>}
          {doc.status === "failed" && (
            <div className="px-5 py-8 text-center">
              <p className="text-red">{doc.error}</p>
              <button onClick={retry} disabled={retrying} className="mt-4 border-2 border-ink bg-white px-4 py-2 font-medium shadow-hard-sm hover:bg-blue-soft disabled:opacity-50">
                {retrying ? "Trying again…" : "Try again"}
              </button>
            </div>
          )}

          {doc.fields && (
            <>
              {doc.notes && (
                <p className="border-b border-rule bg-blue-soft px-5 py-2.5 text-[13.5px]">
                  <span className="font-mono text-[12px] text-blue">AI note · </span>
                  {doc.notes}
                </p>
              )}
              <div>
                {FIELDS.map((f) => {
                  const fv = doc.fields![f.key];
                  const warn = flagged.has(f.key);
                  const failed = failing.find((c) => c.fields.includes(f.key));
                  const changed = (values[f.key] ?? "") !== display(fv.value, f.key);
                  return (
                    <div
                      key={f.key}
                      onMouseEnter={() => setActive(f.key)}
                      onMouseLeave={() => setActive(null)}
                      title={fv.note ?? failed?.detail ?? undefined}
                      className={`grid grid-cols-[1fr_52px] items-center gap-x-2 gap-y-0.5 border-b border-rule px-5 py-[7px] sm:grid-cols-[150px_1fr_60px] ${warn ? "bg-amber-soft" : active === f.key ? "bg-blue-soft/60" : ""}`}
                    >
                      <label htmlFor={`field-${f.key}`} className="col-span-2 text-[13px] text-mu sm:col-span-1 sm:text-[13.5px]">
                        {f.label}
                      </label>
                      <input
                        id={`field-${f.key}`}
                        value={values[f.key] ?? ""}
                        placeholder={fv.value === null ? "not found" : f.hint}
                        disabled={approved || pending}
                        onFocus={() => setActive(f.key)}
                        onBlur={() => setActive(null)}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className={`w-full min-w-0 border bg-transparent px-2 py-1 font-medium ${f.kind === "text" ? "text-[14.5px]" : "font-mono text-[14px]"} outline-none placeholder:font-normal placeholder:text-faint focus:border-ink focus:bg-white disabled:text-ink ${changed ? "border-blue bg-white" : "border-transparent hover:border-rule"}`}
                      />
                      <span className={`text-right font-mono text-[12.5px] ${fv.source === "edited" ? "text-green" : fv.confidence < REVIEW_THRESHOLD && fv.value !== null ? "font-medium text-amber" : "text-faint"}`}>
                        {fv.source === "edited" ? "edited" : fv.confidence.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                {approved ? (
                  <>
                    <span className="flex-1 font-medium text-green">✓ Approved {doc.approvedAt ? timeAgo(doc.approvedAt) : ""}</span>
                    <button onClick={() => start(async () => { const r = await reopenAction(doc.id); if (!r.ok) setError(r.error); router.refresh(); })} disabled={pending} className="border-2 border-ink bg-white px-4 py-2.5 font-semibold hover:bg-blue-soft disabled:opacity-50">
                      Reopen
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => submit(false)} disabled={!dirty || pending} className="flex-1 border-2 border-ink bg-white px-4 py-2.5 font-semibold hover:bg-blue-soft disabled:cursor-not-allowed disabled:border-rule disabled:text-faint disabled:hover:bg-white">
                      {pending ? "Saving…" : "Save changes"}
                    </button>
                    <button onClick={() => submit(true)} disabled={pending} className="flex-1 border-2 border-blue bg-blue px-4 py-2.5 font-semibold text-white hover:bg-blue-dark disabled:opacity-60">
                      {dirty ? "Save & approve" : failing.length ? "Approve anyway" : "Approve"}
                    </button>
                  </>
                )}
                {error && <p className="w-full text-[13.5px] text-red">{error}</p>}
              </div>
            </>
          )}
        </section>

        {doc.fields && (
          <section className="border-2 border-ink bg-white">
            <h3 className="border-b-2 border-ink px-5 py-3 font-semibold">Checks</h3>
            <ul>
              {doc.checks.map((c) => (
                <li key={c.id} className="flex gap-3 border-b border-rule px-5 py-2.5 last:border-0">
                  <span className={`mt-px grid size-5 shrink-0 place-items-center font-mono text-[12px] text-white ${c.ok ? "bg-green" : "bg-amber"}`}>{c.ok ? "✓" : "!"}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{c.label}</span>
                    <span className={`block font-mono text-[12.5px] ${c.ok ? "text-mu" : "text-amber"}`}>{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {doc.lineItems.length > 0 && (
          <section className="border-2 border-ink bg-white">
            <h3 className="border-b-2 border-ink px-5 py-3 font-semibold">
              Line items <span className="font-mono text-[12px] font-normal text-mu">{doc.lineItems.length}</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-rule text-left font-mono text-[11.5px] uppercase tracking-wider text-mu">
                    <th className="px-5 py-2 font-normal">Description</th>
                    <th className="px-2 py-2 text-right font-normal">Qty</th>
                    <th className="px-2 py-2 text-right font-normal">Price</th>
                    <th className="px-5 py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody className="tabular font-mono text-[13px]">
                  {doc.lineItems.map((l, i) => (
                    <tr key={i} className="border-b border-rule last:border-0">
                      <td className="px-5 py-2 font-sans">{l.description}</td>
                      <td className="px-2 py-2 text-right">{l.quantity === null ? "—" : plainNumber(l.quantity)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{l.unit_price === null ? "—" : plainNumber(l.unit_price)}</td>
                      <td className="px-5 py-2 text-right whitespace-nowrap">{money(l.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="border-2 border-ink bg-white">
          <h3 className="border-b-2 border-ink px-5 py-3 font-semibold">History</h3>
          <ol className="px-5 py-3">
            {events.length === 0 && <li className="py-1 text-[13.5px] text-mu">{doc.isSample ? "Bundled sample, extracted when your workspace was created." : "No activity yet."}</li>}
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 py-1.5 text-[13.5px]">
                <span className="w-[74px] shrink-0 font-mono text-[12px] text-faint">{timeAgo(e.createdAt)}</span>
                <span>{describe(e)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function describe(e: DocEvent) {
  const d = e.detail as Record<string, unknown>;
  switch (e.kind) {
    case "uploaded":
      return d.sample ? "Sample sent to the AI" : `Uploaded ${d.file}`;
    case "extracted":
      return `Extracted by ${d.model} in ${((d.ms as number) / 1000).toFixed(1)}s${(d.attempts as number) > 1 ? " (retried once on invalid output)" : ""}`;
    case "edited": {
      const changes = d.changes as { field: string; from: unknown; to: unknown }[];
      return (
        <>
          Edited{" "}
          {changes.map((c, i) => (
            <span key={c.field}>
              {i > 0 && ", "}
              <code className="font-mono text-[12.5px]">{c.field}</code>: <s className="text-faint">{String(c.from ?? "empty")}</s> → {String(c.to ?? "empty")}
            </span>
          ))}
        </>
      );
    }
    case "approved":
      return (d.overrodeChecks as string[])?.length ? "Approved, with checks overridden" : "Approved";
    case "reopened":
      return "Reopened for changes";
    case "webhook":
      return `Webhook ${d.event} → ${d.ok ? `delivered (${d.status})` : `failed: ${d.error ?? `HTTP ${d.status}`}`}`;
    case "failed":
      return `Extraction failed: ${d.error}`;
  }
}
