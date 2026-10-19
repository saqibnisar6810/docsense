/**
 * Precomputes page sizes and field positions for the bundled samples, so a
 * new workspace can show them instantly. Run after changing content/samples.json:
 *   npm run samples
 */
import { readFileSync, writeFileSync } from "node:fs";
import raw from "../content/samples.json";
import { FIELDS, type FieldKey } from "../lib/fields";
import { locate } from "../lib/locate";
import { readPdfText } from "../lib/pdf-text";

type Raw = { slug: string; file: string; mime: string; fields: Record<string, [string | number | null, number]> };

function jpegSize(buf: Buffer) {
  let i = 2;
  while (i < buf.length) {
    const marker = buf.readUInt16BE(i);
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc2) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("not a jpeg");
}

async function main() {
  const out: Record<string, unknown> = {};
  for (const s of raw as unknown as Raw[]) {
    const pageFile = s.mime === "application/pdf" ? s.file.replace(/\.pdf$/, "-p-1.jpg") : s.file;
    const size = jpegSize(readFileSync(`public/samples/${pageFile}`));
    const boxes: Record<string, unknown> = {};
    if (s.mime === "application/pdf") {
      const { pages } = await readPdfText(new Uint8Array(readFileSync(`public/samples/${s.file}`)));
      for (const f of FIELDS) {
        const v = s.fields[f.key as FieldKey][0];
        boxes[f.key] = v === null ? null : locate(pages, f.kind, v);
        if (v !== null && !boxes[f.key]) console.log(`  ${s.slug}: ${f.key} = ${v} not on the page`);
      }
    }
    out[s.slug] = { pages: [{ path: `public:/samples/${pageFile}`, ...size }], boxes };
    console.log(s.slug, Object.values(boxes).filter(Boolean).length, "boxes");
  }
  writeFileSync("content/samples.generated.json", JSON.stringify(out, null, 1) + "\n");
}

main();
