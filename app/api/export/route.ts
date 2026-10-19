import { invoicesCsv, lineItemsCsv } from "@/lib/export";
import { getStore } from "@/lib/store";
import { currentWorkspace } from "@/lib/workspace";

/** CSV download: /api/export?type=invoices|lines&status=approved|all */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "lines" ? "lines" : "invoices";
  const all = url.searchParams.get("status") === "all";
  const ws = await currentWorkspace();
  const docs = (await getStore().listDocuments(ws.id)).filter((d) => d.fields && (all || d.status === "approved"));
  const csv = type === "lines" ? lineItemsCsv(docs) : invoicesCsv(docs);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="docsense-${type === "lines" ? "line-items" : "invoices"}-${stamp}.csv"`,
    },
  });
}
