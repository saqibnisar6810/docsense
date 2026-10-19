"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { preparePages, type Prepared } from "@/lib/client-pages";

type Step = "reading" | "uploading" | "extracting" | "done" | "error";
type Job = { key: string; name: string; step: Step; id?: string; status?: string; error?: string; ms?: number; model?: string };

const STEPS: { key: Step; label: string }[] = [
  { key: "reading", label: "Reading pages" },
  { key: "uploading", label: "Uploading" },
  { key: "extracting", label: "AI extracting" },
];

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export function Uploader({ samples }: { samples: { id: string; label: string; kind: string }[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = useCallback((key: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j))), []);

  const extract = useCallback(
    async (key: string, id: string) => {
      patch(key, { step: "extracting", id });
      const result = await json<{ status: string; extraction: { duration_ms: number; model: string } }>(
        await fetch(`/api/documents/${id}/extract`, { method: "POST" }),
      );
      patch(key, { step: result.status === "failed" ? "error" : "done", status: result.status, ms: result.extraction.duration_ms, model: result.extraction.model, error: result.status === "failed" ? "The AI couldn't read this one." : undefined });
      router.refresh();
    },
    [patch, router],
  );

  const runFile = useCallback(
    async (file: File) => {
      const key = crypto.randomUUID();
      setJobs((js) => [{ key, name: file.name, step: "reading" }, ...js]);
      try {
        const prepared: Prepared = await preparePages(file);
        patch(key, { step: "uploading" });
        const created = await json<{ id: string; file: string; pages: string[] }>(
          await fetch("/api/documents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fileName: file.name, mime: prepared.file.type, size: prepared.file.size, pages: prepared.pages.map((p) => ({ width: p.width, height: p.height })) }),
          }),
        );
        const put = async (url: string, blob: Blob) => {
          const r = await fetch(url, { method: "PUT", headers: { "content-type": blob.type, "x-upsert": "false" }, body: blob });
          if (!r.ok) throw new Error("Upload failed. Please try again.");
        };
        await Promise.all([put(created.file, prepared.file), ...created.pages.map((u, i) => put(u, prepared.pages[i].blob))]);
        router.refresh();
        await extract(key, created.id);
      } catch (e) {
        patch(key, { step: "error", error: e instanceof Error ? e.message : "Something went wrong." });
        router.refresh();
      }
    },
    [extract, patch, router],
  );

  const runFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files].slice(0, 10);
      // Two at a time keeps the free AI tier happy.
      const queue = [...list];
      const worker = async () => {
        while (queue.length) await runFile(queue.shift()!);
      };
      await Promise.all([worker(), worker()]);
    },
    [runFile],
  );

  const trySample = useCallback(
    async (sample: { id: string; label: string }) => {
      const key = crypto.randomUUID();
      setJobs((js) => [{ key, name: `${sample.label} (sample)`, step: "uploading" }, ...js]);
      try {
        const { id } = await json<{ id: string }>(
          await fetch("/api/documents/sample", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sampleId: sample.id }) }),
        );
        router.refresh();
        await extract(key, id);
      } catch (e) {
        patch(key, { step: "error", error: e instanceof Error ? e.message : "Something went wrong." });
      }
    },
    [extract, patch, router],
  );

  return (
    <section className="mt-6 grid gap-0 border-2 border-ink bg-white shadow-hard lg:grid-cols-[1fr_380px]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) runFiles(e.dataTransfer.files);
        }}
        className={`relative m-3 flex min-h-[190px] flex-col items-center justify-center border-2 border-dashed px-6 py-8 text-center transition-colors ${over ? "border-blue bg-blue-soft" : "border-ink/40"}`}
      >
        <svg width="40" height="44" viewBox="0 0 40 44" fill="none" aria-hidden className="mb-3">
          <path d="M3 2h22l12 12v28H3z" stroke="#0B0B0C" strokeWidth="2.5" />
          <path d="M25 2v12h12" stroke="#0B0B0C" strokeWidth="2.5" />
          <path d="M10 24h20M10 30h20M10 36h12" stroke="#1F4DFF" strokeWidth="2.5" />
        </svg>
        <div className="text-[19px] font-semibold">Drop invoices, receipts or PDFs here</div>
        <div className="mt-1 text-mu">
          or{" "}
          <button onClick={() => input.current?.click()} className="font-medium text-blue underline underline-offset-4 hover:text-blue-dark">
            choose files
          </button>{" "}
          · you can drop several at once
        </div>
        <div className="mt-3 font-mono text-[12px] text-faint">PDF · JPG · PNG · WebP · up to 4 MB · first 3 pages</div>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) runFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="border-t-2 border-ink p-5 lg:border-t-0 lg:border-l-2">
        <div className="font-mono text-[12px] uppercase tracking-wider text-mu">No invoice handy?</div>
        <p className="mt-1 text-[14px] text-mu">Run a sample through the AI live:</p>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {samples.map((s) => (
            <li key={s.id}>
              <button onClick={() => trySample(s)} className="group flex w-full items-center gap-3 py-2 text-left text-[14px] hover:text-blue">
                <span className="w-11 shrink-0 font-mono text-[11px] text-faint">{s.kind}</span>
                <span className="flex-1 truncate">{s.label}</span>
                <span className="font-mono text-[12px] text-blue opacity-70 group-hover:opacity-100">Run →</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {jobs.length > 0 && (
        <ul className="border-t-2 border-ink lg:col-span-2">
          {jobs.map((j) => (
            <li key={j.key} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule px-5 py-3 last:border-0">
              <span className="min-w-0 max-w-[280px] flex-1 truncate font-medium">{j.name}</span>
              <ol className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
                {STEPS.map((s, i) => {
                  const at = STEPS.findIndex((x) => x.key === j.step);
                  const done = j.step === "done" || (at > i && j.step !== "error");
                  const active = at === i;
                  return (
                    <li key={s.key} className={done ? "text-ink" : active ? "text-blue" : "text-faint"}>
                      {done ? "✓" : active ? "●" : "○"} {s.label}
                      {active && <span className="ml-1 inline-block h-[3px] w-10 overflow-hidden bg-blue-soft align-middle"><span className="block h-full w-1/2 animate-[pulse-bar_1s_linear_infinite] bg-blue" /></span>}
                    </li>
                  );
                })}
              </ol>
              <span className="ml-auto text-[13px]">
                {j.step === "error" && <span className="text-red">{j.error}</span>}
                {j.step === "done" && j.id && (
                  <Link href={`/documents/${j.id}`} className="font-medium text-blue hover:underline">
                    {j.status === "needs_review" ? "Needs review" : "Ready"} · {(j.ms! / 1000).toFixed(1)}s · Review →
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
