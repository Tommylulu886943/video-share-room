import { z } from "zod";

export const memberFieldsSchema = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/)
    .refine(id => !["__proto__", "constructor", "prototype"].includes(id), "欄位代碼無效"),
  label: z.string().trim().min(1, "請填寫欄位名稱").max(60),
  required: z.boolean(),
})).max(10, "最多 10 個自訂欄位").superRefine((fields, ctx) => {
  if (new Set(fields.map(f => f.id)).size !== fields.length ||
      new Set(fields.map(f => f.label)).size !== fields.length) {
    ctx.addIssue({ code: "custom", message: "欄位名稱不可重複" });
  }
});
export type MemberField = z.infer<typeof memberFieldsSchema>[number];
export const attributeValuesSchema = z.record(z.string().max(60), z.string().trim().max(500)).default({});
export function parseMemberFields(json: string): MemberField[] {
  return memberFieldsSchema.parse(JSON.parse(json));
}
export function validateAttributes(fields: MemberField[], values: Record<string, string>) {
  const shape: Record<string, z.ZodString> = {};
  for (const field of fields) {
    shape[field.id] = field.required
      ? z.string().trim().min(1, `請填寫${field.label}`).max(500)
      : z.string().trim().max(500);
  }
  return z.object(shape).strict().parse(Object.fromEntries(
    [...new Set([...fields.map(f => f.id), ...Object.keys(values)])]
      .map(id => [id, values[id] ?? ""]),
  ));
}
export function memberAttributeSummary(fields: MemberField[], json: string, level = "") {
  const values = JSON.parse(json) as Record<string, string>;
  return fields.map(f => `${f.label}：${values[f.id] || (f.id === "level" ? level : "") || "—"}`).join("・");
}
