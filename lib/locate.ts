import type { FieldKind } from "@/lib/fields";
import type { Box } from "@/lib/types";

/** A run of text from a PDF's text layer. x/y are PDF units, y is the baseline measured from the bottom. */
export type TextItem = { str: string; x: number; y: number; w: number; h: number };
export type TextPage = { width: number; height: number; items: TextItem[] };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function groupThousands(int: string, sep: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Every common way a number like 3204.5 is printed: 3,204.50 · 3.204,50 · 3 204,50 · 3204.50 … */
export function numberVariants(n: number): string[] {
  const neg = n < 0;
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [int, dec] = fixed.split(".");
  const out = new Set<string>([
    `${groupThousands(int, ",")}.${dec}`,
    `${groupThousands(int, ".")},${dec}`,
    `${groupThousands(int, " ")},${dec}`,
    `${groupThousands(int, " ")},${dec}`,
    `${int}.${dec}`,
    `${int},${dec}`,
  ]);
  if (dec === "00") {
    out.add(groupThousands(int, ","));
    out.add(groupThousands(int, "."));
    out.add(int);
  } else if (dec.endsWith("0")) {
    out.add(`${int}.${dec[0]}`);
    out.add(`${int},${dec[0]}`);
  }
  // More precise values (e.g. a 0.425 unit price).
  if (Math.round(abs * 100) !== abs * 100) out.add(String(abs));
  return [...out].map((v) => (neg ? `-${v}` : v));
}

export function dateVariants(iso: string): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return [iso];
  const [, y, mm, dd] = m;
  const d = Number(dd), mo = Number(mm);
  const name = MONTHS[mo - 1] ?? "";
  const short = name.slice(0, 3);
  return [
    iso,
    `${d} ${name} ${y}`, `${dd} ${name} ${y}`, `${name} ${d}, ${y}`, `${name} ${dd}, ${y}`,
    `${d} ${short} ${y}`, `${dd} ${short} ${y}`, `${short} ${d}, ${y}`, `${short} ${dd}, ${y}`,
    `${dd}.${mm}.${y}`, `${d}.${mo}.${y}`, `${dd}/${mm}/${y}`, `${mm}/${dd}/${y}`, `${d}/${mo}/${y}`, `${mo}/${d}/${y}`,
    `${dd}-${mm}-${y}`, `${dd}/${mm}/${y.slice(2)}`, `${mm}/${dd}/${y.slice(2)}`,
  ];
}

export function candidates(kind: FieldKind, value: string | number): string[] {
  if (kind === "money" && typeof value === "number") return numberVariants(value);
  if (kind === "percent" && typeof value === "number") {
    const v = numberVariants(value).filter((s) => !/[  ]/.test(s));
    return v.flatMap((s) => [`${s}%`, `${s} %`]);
  }
  if (kind === "date" && typeof value === "string") return dateVariants(value);
  return [String(value)];
}

type Indexed = { text: string; map: number[]; offsets: number[] };

/** Joins a page's items into one lowercase string and remembers which item each character came from. */
function indexPage(items: TextItem[], compact: boolean): Indexed {
  let text = "";
  const map: number[] = [];
  const offsets: number[] = [];
  items.forEach((it, i) => {
    const s = it.str.toLowerCase();
    for (let c = 0; c < s.length; c++) {
      let ch = s[c];
      if (/\s/.test(ch)) ch = " ";
      if (compact && !/[\p{L}\p{N}]/u.test(ch)) continue;
      if (ch === " " && text.endsWith(" ")) continue;
      text += ch; map.push(i); offsets.push(c);
    }
    if (!compact && !text.endsWith(" ")) { text += " "; map.push(i); offsets.push(s.length); }
  });
  return { text, map, offsets };
}

function norm(s: string, compact: boolean) {
  const lower = s.toLowerCase().replace(/\s+/g, " ").trim();
  return compact ? lower.replace(/[^\p{L}\p{N}]/gu, "") : lower;
}

/** Rough relative glyph widths, so a box inside a longer text run lands on the right letters. */
function glyphWidth(ch: string) {
  if (/[iljtfr.,:;'|!]/.test(ch)) return 0.3;
  if (ch === " ") return 0.28;
  if (/[mwMW@]/.test(ch)) return 0.9;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[a-z]/.test(ch)) return 0.52;
  return 0.6;
}

function charSpan(it: TextItem, offset: number): [number, number] {
  const widths = [...it.str].map(glyphWidth);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  const before = widths.slice(0, offset).reduce((a, b) => a + b, 0);
  const own = widths[offset] ?? 0;
  return [it.x + (it.w * before) / total, it.x + (it.w * (before + own)) / total];
}

function boxFor(page: TextPage, pageNo: number, idx: Indexed, start: number, end: number): Box {
  let x0 = Infinity, x1 = -Infinity, top = Infinity, bottom = -Infinity;
  for (let k = start; k < end; k++) {
    const it = page.items[idx.map[k]];
    const [cx0, cx1] = charSpan(it, idx.offsets[k]);
    const h = it.h || 10;
    x0 = Math.min(x0, cx0); x1 = Math.max(x1, cx1);
    top = Math.min(top, page.height - it.y - h * 0.92);
    bottom = Math.max(bottom, page.height - it.y + h * 0.28);
  }
  const pad = 2;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    page: pageNo,
    x: r(Math.max(0, (x0 - pad) / page.width)),
    y: r(Math.max(0, (top - pad) / page.height)),
    w: r(Math.min(1, (x1 - x0 + pad * 2) / page.width)),
    h: r(Math.min(1, (bottom - top + pad * 2) / page.height)),
  };
}

const isNumericNeedle = (s: string) => /^[-\d.,\s %]+$/.test(s);

/**
 * Finds where a value is printed on the document. Returns null when it isn't
 * there, which is itself a useful signal: the model may have guessed it.
 */
export function locate(pages: TextPage[], kind: FieldKind, value: string | number | null): Box | null {
  if (value === null || value === "") return null;
  const compact = kind === "code" || kind === "text";
  for (const mode of compact ? [false, true] : [false]) {
    const needles = candidates(kind, value).map((c) => norm(c, mode)).filter((n) => n.length > 0);
    for (let p = 0; p < pages.length; p++) {
      const idx = indexPage(pages[p].items, mode);
      for (const needle of needles) {
        if (mode && needle.length < 4) continue; // too short to match safely without separators
        let from = 0;
        while (true) {
          const at = idx.text.indexOf(needle, from);
          if (at < 0) break;
          const end = at + needle.length;
          const before = idx.text[at - 1] ?? " ";
          const after = idx.text[end] ?? " ";
          // "21" must not match inside "2021", "84" not inside "672.84".
          const numeric = isNumericNeedle(needle);
          const okBefore = numeric ? !/[\d.,]/.test(before) || /[.,]/.test(before) && !/\d/.test(idx.text[at - 2] ?? "") : !/[\p{L}\p{N}]/u.test(before) || mode;
          const okAfter = numeric ? !/\d/.test(after) && !(/[.,]/.test(after) && /\d/.test(idx.text[end + 1] ?? "")) : !/[\p{L}\p{N}]/u.test(after) || mode;
          if (okBefore && okAfter) return boxFor(pages[p], p + 1, idx, at, end);
          from = at + 1;
        }
      }
    }
  }
  return null;
}

/** Plain text of the pages, line by line, for the text-only extraction path. */
export function pagesToText(pages: TextPage[]): string {
  return pages
    .map((page, i) => {
      const lines: { y: number; parts: TextItem[] }[] = [];
      for (const it of page.items) {
        if (!it.str.trim()) continue;
        const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, it.h * 0.4));
        if (line) line.parts.push(it);
        else lines.push({ y: it.y, parts: [it] });
      }
      lines.sort((a, b) => b.y - a.y);
      const body = lines
        .map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).join("   "))
        .join("\n");
      return `--- page ${i + 1} ---\n${body}`;
    })
    .join("\n\n");
}
