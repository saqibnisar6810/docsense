"use client";

export type Prepared = {
  /** What gets uploaded as the original: the PDF itself, or a resized JPEG of a photo. */
  file: File;
  /** Page images shown in the review screen (and read by the vision model for scans). */
  pages: { blob: Blob; width: number; height: number }[];
};

const PAGE_WIDTH = 1240; // ≈150 dpi for A4
const MAX_PHOTO_SIDE = 2000;
const MAX_BYTES = 4 * 1024 * 1024;

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.84): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image."))), "image/jpeg", quality));
}

async function pdfPages(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise.catch(() => {
    throw new Error("This PDF couldn't be opened. It may be damaged or password protected.");
  });
  const pages: Prepared["pages"] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    pages.push({ blob: await canvasToJpeg(canvas), width: canvas.width, height: canvas.height });
  }
  await task.destroy();
  return pages;
}

async function photo(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("This image couldn't be opened.");
  });
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await canvasToJpeg(canvas, 0.86);
  return { blob, width: canvas.width, height: canvas.height };
}

/** Turns a dropped file into an upload-ready original plus page images, all in the browser. */
export async function preparePages(file: File): Promise<Prepared> {
  const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (type === "application/pdf") {
    if (file.size > MAX_BYTES) throw new Error("PDFs must be under 4 MB.");
    const pages = await pdfPages(file);
    return { file: new File([file], file.name, { type }), pages };
  }
  if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error("Upload a PDF, JPG, PNG or WebP file.");
  const page = await photo(file);
  const name = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
  return { file: new File([page.blob], name, { type: "image/jpeg" }), pages: [page] };
}
