import { STATUS } from "@/lib/format";
import type { DocStatus } from "@/lib/types";

export function StatusChip({ status }: { status: DocStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-[3px] font-mono text-[12px] leading-none whitespace-nowrap ${s.cls}`}>
      {status === "approved" ? "✓ " : status === "processing" ? <span className="size-1.5 animate-pulse bg-blue" /> : null}
      {s.label}
    </span>
  );
}
