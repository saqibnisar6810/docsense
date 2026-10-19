import Link from "next/link";
import { notFound } from "next/navigation";
import { Review } from "@/components/Review";
import { StatusChip } from "@/components/StatusChip";
import { getStore } from "@/lib/store";
import { currentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ws = await currentWorkspace();
  const store = getStore();
  const doc = await store.getDocument(ws.id, id);
  if (!doc) notFound();
  const [pages, events, all] = await Promise.all([
    Promise.all(doc.pages.map(async (p) => ({ ...p, url: await store.viewUrl(p.path) }))),
    store.listEvents(ws.id, id),
    store.listDocuments(ws.id),
  ]);
  const at = all.findIndex((d) => d.id === id);
  const prev = all[at - 1]?.id;
  const next = all[at + 1]?.id;

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-24 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="font-mono text-[13px] text-mu hover:text-ink">← Documents</Link>
        <span className="text-faint">/</span>
        <h1 className="max-w-[460px] truncate text-[20px] font-semibold tracking-[-0.01em]">{doc.fileName}</h1>
        <StatusChip status={doc.status} />
        {doc.isSample && <span className="border border-rule px-2 py-[3px] font-mono text-[12px] text-mu">sample</span>}
        <div className="ml-auto flex items-center gap-2 font-mono text-[13px]">
          {prev ? <Link href={`/documents/${prev}`} className="border-2 border-ink bg-white px-2.5 py-1 hover:bg-blue-soft">↑ Prev</Link> : <span className="border-2 border-rule px-2.5 py-1 text-faint">↑ Prev</span>}
          {next ? <Link href={`/documents/${next}`} className="border-2 border-ink bg-white px-2.5 py-1 hover:bg-blue-soft">↓ Next</Link> : <span className="border-2 border-rule px-2.5 py-1 text-faint">↓ Next</span>}
        </div>
      </div>
      <Review doc={doc} pages={pages} events={events} />
    </main>
  );
}
