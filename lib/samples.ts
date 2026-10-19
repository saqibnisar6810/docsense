import raw from "@/content/samples.json";
import generated from "@/content/samples.generated.json";
import { FIELDS, type FieldKey, type ModelOutput } from "@/lib/fields";
import type { Box, Fields, LineItem, PageImage } from "@/lib/types";

type RawSample = {
  slug: string;
  file: string;
  mime: string;
  method: "text" | "vision";
  model: string;
  durationMs: number;
  ageMinutes: number;
  approvedMinutesAgo?: number;
  document_type: string;
  fields: Record<FieldKey, [string | number | null, number]>;
  line_items: LineItem[];
  notes: string | null;
};

export type Sample = RawSample & { pages: PageImage[]; boxes: Partial<Record<FieldKey, Box | null>> };

const gen = generated as Record<string, { pages: PageImage[]; boxes: Partial<Record<FieldKey, Box | null>> }>;

export const samples: Sample[] = (raw as unknown as RawSample[]).map((s) => ({
  ...s,
  pages: gen[s.slug]?.pages ?? [],
  boxes: gen[s.slug]?.boxes ?? {},
}));

export function sampleFields(s: Sample): Fields {
  return Object.fromEntries(
    FIELDS.map((f) => [f.key, { value: s.fields[f.key][0], confidence: s.fields[f.key][1], box: s.boxes[f.key] ?? null, source: "model" as const }]),
  ) as Fields;
}

/** The sample's answer in the shape the model returns (used by the offline mock). */
export function sampleAsModelOutput(s: Sample): ModelOutput {
  const fields = Object.fromEntries(FIELDS.map((f) => [f.key, { value: s.fields[f.key][0], confidence: s.fields[f.key][1] }]));
  return {
    document_type: s.document_type as ModelOutput["document_type"],
    fields: fields as ModelOutput["fields"],
    line_items: s.line_items,
    notes: s.notes,
  };
}
