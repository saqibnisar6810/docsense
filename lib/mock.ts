import type { ModelOutput } from "@/lib/fields";
import { sampleAsModelOutput, samples } from "@/lib/samples";

type MockInput = { kind: "text"; text: string } | { kind: "images" } | { kind: "pdf" };

/**
 * Offline stand-in for the AI, used only when EXTRACT_MOCK=1 (local tests
 * without API keys). It recognises the bundled samples by invoice number.
 */
export async function mockExtract(input: MockInput): Promise<ModelOutput> {
  await new Promise((r) => setTimeout(r, 700));
  if (input.kind === "text") {
    const hit = samples.find((s) => input.text.includes(String(s.fields.invoice_number[0])));
    if (hit) return sampleAsModelOutput(hit);
  }
  return sampleAsModelOutput(samples.find((s) => s.method === "vision") ?? samples[0]);
}
