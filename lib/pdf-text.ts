import { getDocumentProxy } from "unpdf";
import type { TextPage } from "@/lib/locate";

export const MAX_PAGES = 3;

/** Reads the text layer of the first pages of a PDF. Scanned PDFs come back with no items. */
export async function readPdfText(data: Uint8Array): Promise<{ pageCount: number; pages: TextPage[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    const pages: TextPage[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES); n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((it): it is typeof it & { str: string; transform: number[]; width: number; height: number } => "str" in it)
        .map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          w: it.width,
          h: it.height || Math.hypot(it.transform[2], it.transform[3]),
        }));
      pages.push({ width: vp.width, height: vp.height, items });
    }
    return { pageCount: pdf.numPages, pages };
  } finally {
    await pdf.cleanup?.();
  }
}

/** True when the PDF has real text (not just a scanned image). */
export function hasTextLayer(pages: TextPage[]) {
  const chars = pages.reduce((n, p) => n + p.items.reduce((m, it) => m + it.str.trim().length, 0), 0);
  return chars >= 40;
}
