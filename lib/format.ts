import type { DocStatus } from "@/lib/types";

export function money(value: unknown, currency?: unknown) {
  if (typeof value !== "number") return "—";
  const code = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : undefined;
  try {
    return new Intl.NumberFormat("en-US", code ? { style: "currency", currency: code } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code ?? ""}`.trim();
  }
}

export function plainNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function shortDate(iso: unknown) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "—";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const STATUS: Record<DocStatus, { label: string; cls: string }> = {
  processing: { label: "Extracting", cls: "border-blue text-blue bg-blue-soft" },
  needs_review: { label: "Needs review", cls: "border-amber text-amber bg-amber-soft" },
  ready: { label: "Ready", cls: "border-ink text-ink bg-white" },
  approved: { label: "Approved", cls: "border-green text-green bg-green-soft" },
  failed: { label: "Failed", cls: "border-red text-red bg-red-soft" },
};
