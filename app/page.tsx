import Link from "next/link";
import { Uploader } from "@/components/Uploader";
import { StatusChip } from "@/components/StatusChip";
import { money, shortDate, timeAgo } from "@/lib/format";
import { getStore } from "@/lib/store";
import type { DocStatus, DocumentRecord } from "@/lib/types";
import { lowConfidence } from "@/lib/validate";
import { currentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; match: (s: DocStatus) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "needs_review", label: "Needs review", match: (s) => s === "needs_review" },
  { key: "ready", label: "Ready to approve", match: (s) => s === "ready" },
  { key: "approved", label: "Approved", match: (s) => s === "approved" },
];

function flags(d: DocumentRecord) {
  if (d.status === "failed") return <span className="text-red">{d.error}</span>;
  if (!d.fields) return <span className="text-faint">—</span>;
  const failed = d.checks.filter((c) => !c.ok);
  const low = lowConfidence(d.fields);
  if (!failed.length && !low.length) return <span className="text-faint">All checks passed</span>;
  return (
    <span className="text-amber">
      {[...failed.map((c) => c.detail.split(" (")[0]), low.length ? `${low.length} field${low.length > 1 ? "s" : ""} to check` : null].filter(Boolean).join(" · ")}
    </span>
  );
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  const ws = await currentWorkspace();
  const docs = await getStore().listDocuments(ws.id);
  const tab = TABS.find((t) => t.key === status) ?? TABS[0];
  const shown = docs.filter((d) => tab.match(d.status));
  const count = (s: DocStatus) => docs.filter((d) => d.status === s).length;
  const timed = docs.filter((d) => d.durationMs);
  const avg = timed.length ? timed.reduce((n, d) => n + (d.durationMs ?? 0), 0) / timed.length / 1000 : 0;
  const samples = docs.filter((d) => d.isSample).map((d) => ({ id: d.id, label: d.fields?.vendor_name.value as string, kind: d.mime === "application/pdf" ? "PDF" : "Photo" }));

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] sm:text-[42px]">
            Invoices in. <span className="text-blue">Clean data</span> out.
          </h1>
          <p className="mt-3 max-w-[640px] text-[15px] text-mu">
            Drop in a PDF or a photo of an invoice. The AI reads every field, checks the math, and sends anything uncertain to you for review.
          </p>
        </div>
        <p className="font-mono text-[12px] text-faint">Private demo workspace · uploads are deleted after 24 h</p>
      </div>

      <section className="mt-7 grid grid-cols-2 border-2 border-ink bg-white md:grid-cols-4">
        {[
          { label: "Needs review", value: count("needs_review"), cls: "text-amber" },
          { label: "Ready to approve", value: count("ready"), cls: "" },
          { label: "Approved", value: count("approved"), cls: "text-green" },
          { label: "Avg. extraction time", value: avg ? `${avg.toFixed(1)}s` : "—", cls: "" },
        ].map((s, i) => (
          <div key={s.label} className={`px-5 py-4 ${i % 2 ? "border-l-2 border-ink" : ""} ${i > 1 ? "border-t-2 border-ink md:border-t-0" : ""} ${i === 2 ? "md:border-l-2" : ""}`}>
            <div className="font-mono text-[12px] uppercase tracking-wider text-mu">{s.label}</div>
            <div className={`tabular mt-1 text-[30px] font-semibold leading-none ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </section>

      <Uploader samples={samples} />

      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b-2 border-ink">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "all" ? "/" : `/?status=${t.key}`}
              className={`-mb-[2px] border-b-[3px] pb-2 text-[14px] font-medium ${t.key === tab.key ? "border-blue text-ink" : "border-transparent text-mu hover:text-ink"}`}
            >
              {t.label}
              <span className="ml-1.5 font-mono text-[12px] text-faint">{docs.filter((d) => t.match(d.status)).length}</span>
            </Link>
          ))}
          <div className="ml-auto flex gap-2 pb-2">
            <a href="/api/export?type=invoices" className="border-2 border-ink bg-white px-3 py-1.5 text-[13px] font-medium shadow-hard-sm hover:bg-blue-soft">
              Export approved · CSV
            </a>
            <a href="/api/export?type=lines" className="border-2 border-ink bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-blue-soft">
              Line items · CSV
            </a>
          </div>
        </div>

        <div className="overflow-x-auto border-x-2 border-b-2 border-ink bg-white">
          <table className="w-full min-w-[920px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-rule font-mono text-[12px] uppercase tracking-wider text-mu">
                <th className="px-4 py-3 font-normal">Document</th>
                <th className="px-4 py-3 font-normal">Vendor</th>
                <th className="px-4 py-3 font-normal">Invoice no.</th>
                <th className="px-4 py-3 font-normal">Date</th>
                <th className="px-4 py-3 text-right font-normal">Total</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Flags</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} className="group relative border-b border-rule last:border-0 hover:bg-blue-soft/60">
                  <td className="px-4 py-3">
                    <Link href={`/documents/${d.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                      <span className="grid size-8 shrink-0 place-items-center border border-ink font-mono text-[10px]">{d.mime === "application/pdf" ? "PDF" : "IMG"}</span>
                      <span className="min-w-0">
                        <span className="block max-w-[220px] truncate font-medium group-hover:text-blue">{d.fileName}</span>
                        <span className="font-mono text-[12px] text-faint">
                          {timeAgo(d.createdAt)}
                          {d.isSample ? " · sample" : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3">{(d.fields?.vendor_name.value as string) ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{(d.fields?.invoice_number.value as string) ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{shortDate(d.fields?.issue_date.value)}</td>
                  <td className="tabular px-4 py-3 text-right font-mono text-[13px] whitespace-nowrap">{money(d.fields?.total.value, d.fields?.currency.value)}</td>
                  <td className="px-4 py-3"><StatusChip status={d.status} /></td>
                  <td className="max-w-[260px] px-4 py-3 text-[13px]">{flags(d)}</td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-mu">Nothing here yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
